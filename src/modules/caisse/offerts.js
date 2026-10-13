// Panier de la caisse avec lignes offertes et happy hour : règles pures, testées dans
// tests/offerts_happyhour_pourboires.test.js. Une ligne du panier : { article_id, quantite, offert?: { raison, precision } }.
// Une ligne offerte part à enregistrer_vente avec une remise égale à son prix (total 0) ; la raison est ensuite gardée
// par enregistrer_offerts_vente (migration 20261013000135).
import { pourcentageArticle, remiseHappyHour } from './happyHour.js';

export const RAISONS_OFFERT = ['Client fidèle', 'Geste commercial', 'Erreur de service', 'Patron', 'Autre'];

// Une ligne normale et une ligne offerte du même article vivent côte à côte dans le panier.
export const cleLigne = (l) => `${l.article_id}${l.offert ? ':offert' : ''}`;

const arrondir = (n) => Math.round(Number(n) * 1000) / 1000;

// Ajouter un article : toujours sur la ligne normale (jamais sur la ligne offerte).
export function ajouterAuPanier(lignes, articleId, quantite = 1) {
  const existante = lignes.find((l) => l.article_id === articleId && !l.offert);
  if (existante) return lignes.map((l) => (l === existante ? { ...l, quantite: arrondir(l.quantite + quantite) } : l));
  return [...lignes, { article_id: articleId, quantite }];
}

// Changer la quantité d'une ligne (0 ou moins : la ligne disparaît).
export function changerQuantiteLigne(lignes, cle, quantite) {
  if (!(quantite > 0)) return lignes.filter((l) => cleLigne(l) !== cle);
  return lignes.map((l) => (cleLigne(l) === cle ? { ...l, quantite } : l));
}

// Offrir tout ou partie d'une ligne normale. Le reste (s'il y en a) reste payant.
export function offrirLigne(lignes, cle, quantite, offert) {
  const source = lignes.find((l) => cleLigne(l) === cle && !l.offert);
  const q = Math.min(Number(quantite) || 0, source?.quantite ?? 0);
  if (!source || !(q > 0)) return lignes;
  const raison = { raison: offert.raison, ...(offert.precision?.trim() ? { precision: offert.precision.trim() } : {}) };
  const dejaOffert = lignes.find((l) => l.article_id === source.article_id && l.offert);
  let suite = lignes
    .map((l) => (l === source ? { ...l, quantite: arrondir(l.quantite - q) } : l))
    .filter((l) => l.quantite > 0);
  if (dejaOffert) suite = suite.map((l) => (l === dejaOffert ? { ...l, quantite: arrondir(l.quantite + q), offert: raison } : l));
  else {
    const rang = suite.findIndex((l) => l.article_id === source.article_id);
    const ligne = { article_id: source.article_id, quantite: q, offert: raison };
    suite = rang >= 0 ? [...suite.slice(0, rang + 1), ligne, ...suite.slice(rang + 1)] : [...suite, ligne];
  }
  return suite;
}

// Annuler l'offert : la ligne redevient payante (fusionnée avec la ligne normale du même article).
export function annulerOffert(lignes, cle) {
  const offerte = lignes.find((l) => cleLigne(l) === cle && l.offert);
  if (!offerte) return lignes;
  return ajouterAuPanier(lignes.filter((l) => l !== offerte), offerte.article_id, offerte.quantite);
}

// Lignes reprises d'une facture en cours : une seule ligne par article (les offerts ne sont pas gardés en attente).
export function fusionnerLignes(lignes) {
  return lignes.reduce((acc, l) => ajouterAuPanier(acc, l.article_id, Number(l.quantite)), []);
}

// Remise de chaque ligne : offert = prix complet ; sinon happy hour éventuel. options : { creneaux, date, decimales }.
export function remiseLigne(ligne, article, { creneaux = [], date = new Date(), decimales = 0 } = {}) {
  if (!article) return 0;
  const brut = Math.round(Number(article.prix_vente) * ligne.quantite * 100) / 100;
  if (ligne.offert) return brut;
  return remiseHappyHour(article.prix_vente, ligne.quantite, pourcentageArticle(creneaux, article, date), decimales);
}

// Ce qui part à enregistrer_vente : { article_id, quantite } et la remise seulement si elle existe.
export function lignesPourVente(lignes, articles, options) {
  return lignes.map((l) => {
    const remise = remiseLigne(l, articles[l.article_id], options);
    return remise > 0 ? { article_id: l.article_id, quantite: l.quantite, remise } : { article_id: l.article_id, quantite: l.quantite };
  });
}

// Totaux du panier : brut (prix × quantité), offerts, happy hour, sous-total après remises de ligne.
export function totauxPanier(lignes, articles, options) {
  let brut = 0;
  let offerts = 0;
  let happyHour = 0;
  for (const l of lignes) {
    const a = articles[l.article_id];
    if (!a) continue;
    const montant = Math.round(Number(a.prix_vente) * l.quantite * 100) / 100;
    brut += montant;
    const remise = remiseLigne(l, a, options);
    if (l.offert) offerts += remise;
    else happyHour += remise;
  }
  return { brut, offerts, happyHour, sousTotal: Math.max(brut - offerts - happyHour, 0) };
}

// Ce qui part à enregistrer_offerts_vente après la vente.
export function offertsPourVente(lignes) {
  return lignes.filter((l) => l.offert).map((l) => ({
    article_id: l.article_id, quantite: l.quantite, raison: l.offert.raison, ...(l.offert.precision ? { precision: l.offert.precision } : {}),
  }));
}

// Raison lisible : « Autre : anniversaire » ou « Client fidèle ».
export const texteRaison = (o) => (o?.raison === 'Autre' && o.precision ? o.precision : o?.precision ? `${o.raison} : ${o.precision}` : o?.raison ?? '');

// Note de la vente (gardée avec la vente, imprimée sur le reçu) : « Offert : 1 × Primus (Client fidèle) ».
export function noteOfferts(lignes, articles) {
  const offertes = lignes.filter((l) => l.offert && articles[l.article_id]);
  if (!offertes.length) return null;
  const texte = `Offert : ${offertes.map((l) => `${String(l.quantite).replace('.', ',')} × ${articles[l.article_id].nom} (${texteRaison(l.offert)})`).join(' ; ')}`;
  return texte.length > 300 ? `${texte.slice(0, 299)}…` : texte;
}
