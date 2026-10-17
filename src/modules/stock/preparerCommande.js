// « Préparer la commande » et alerte « Plus que N » de la caisse : règles pures, testées dans
// tests/offerts_happyhour_pourboires.test.js. Rien ne part tout seul : le lien wa.me ouvre WhatsApp avec le texte,
// la personne vérifie et appuie sur « Envoyer » (aucune API WhatsApp).
import { formatQuantite } from '../../noyau/format.js';
import { quantiteSuggeree } from '../achats/commandeWhatsApp.js';

// Tuile de caisse : « Plus que 3 » quand le stock est au minimum ou en dessous (minimum réglé sur l'article).
// null si l'article ne suit pas de stock, n'a pas de minimum, ou est au-dessus.
export function alerteStock(quantite, minimum) {
  const q = Number(quantite);
  const min = Number(minimum);
  if (!(min > 0) || !Number.isFinite(q) || q > min) return null;
  if (q <= 0) return 'Épuisé';
  return `Plus que ${formatQuantite(q)}`;
}

// Articles suivis au stock et au minimum ou en dessous dans un Hub. stockDe : { article_id: quantité }.
export function articlesSousMinimum(articles, stockDe) {
  return articles
    .filter((a) => a.actif !== false && a.suivi_stock && Number(a.stock_minimum) > 0)
    .map((a) => ({
      article_id: a.id, nom: a.nom, reference: a.reference ?? null, unite: a.unite, minimum: Number(a.stock_minimum),
      stock: Number(stockDe[a.id] ?? 0), categorie_id: a.categorie_id ?? null,
    }))
    .filter((s) => s.stock <= s.minimum)
    .sort((a, b) => a.stock / a.minimum - b.stock / b.minimum || a.nom.localeCompare(b.nom, 'fr'));
}

// Conditionnement et fournisseur retenus par article (Réception intelligente) : le plus récemment utilisé, avec un
// fournisseur de préférence. Renvoie { article_id: { fournisseur_id, conditionnement, unites } }.
export function retenusParArticle(conditionnements) {
  const resultat = {};
  const tries = [...(conditionnements ?? [])].sort((a, b) => String(b.utilise_le ?? '').localeCompare(String(a.utilise_le ?? '')));
  for (const c of tries) {
    const actuel = resultat[c.article_id];
    if (!actuel) {
      resultat[c.article_id] = { fournisseur_id: c.fournisseur_id ?? null, conditionnement: c.nom, unites: Number(c.unites) || 1 };
    } else if (!actuel.fournisseur_id && c.fournisseur_id) {
      actuel.fournisseur_id = c.fournisseur_id;
    }
  }
  return resultat;
}

// Quantité proposée : remonter au double du minimum ; en conditionnements entiers quand on en connaît un (casier de 24).
// Renvoie { quantite, parConditionnement } : quantite en conditionnements si parConditionnement > 1, sinon en unités.
export function suggestion(s, retenu) {
  const unites = quantiteSuggeree({ minimum: s.minimum, stock: Math.max(s.stock, 0) });
  const par = retenu?.unites > 1 ? retenu.unites : 1;
  return { quantite: par > 1 ? Math.max(1, Math.ceil(unites / par)) : unites, parConditionnement: par };
}

// Groupes par fournisseur (sans fournisseur connu : en dernier).
export function grouperCommande(lignes) {
  const groupes = new Map();
  for (const l of lignes) {
    const f = l.fournisseur_id ?? null;
    if (!groupes.has(f)) groupes.set(f, []);
    groupes.get(f).push(l);
  }
  return [...groupes.entries()].sort(([a], [b]) => (a === null) - (b === null)).map(([fournisseur_id, liste]) => ({ fournisseur_id, liste }));
}

// Une ligne de la commande : « Primus 65 cl : 3 casiers de 24 (72) » ou « Sucre 1 kg : 20 ».
export function texteLigne(l) {
  const q = Number(l.quantite);
  if (l.parConditionnement > 1) {
    const nom = String(l.conditionnement || 'lot').trim();
    const pluriel = q > 1 && !/[sx]$/i.test(nom) ? `${nom}s` : nom;
    return `${l.nom} : ${formatQuantite(q)} ${pluriel.toLowerCase()} de ${l.parConditionnement} (${formatQuantite(q * l.parConditionnement)})`;
  }
  return `${l.nom} : ${formatQuantite(q, l.unite)}`;
}

// Texte de la commande, propre et poli. Les lignes à 0 sont retirées.
export function texteCommande({ fournisseur, etablissement, lignes }) {
  const liste = lignes.filter((l) => Number(l.quantite) > 0).map((l) => `- ${texteLigne(l)}`);
  return [
    fournisseur ? `Bonjour ${fournisseur},` : 'Bonjour,',
    '',
    'Voici notre commande :',
    ...liste,
    '',
    'Merci de nous confirmer la disponibilité, le prix et le jour de livraison.',
    'Bonne journée,',
    etablissement || '',
  ].join('\n').trim();
}
