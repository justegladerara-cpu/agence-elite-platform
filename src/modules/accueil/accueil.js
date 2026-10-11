// Logique pure de l'écran d'accueil (testée sans écran) : gros boutons, barre « Je veux… », bilan du jour.
import { correspond, score } from '../../noyau/actionsRapides.js';
import { formatMontant } from '../../noyau/format.js';

// Gros boutons, en mots de commerçant. Chacun n'apparaît que si son écran est accessible et l'action permise.
export const GROS_BOUTONS = [
  { id: 'vendre', libelle: 'Vendre', detail: 'Ouvrir la caisse', icone: 'caisse', route: 'caisse', permission: 'caisse.utiliser', mots: 'caisse vente encaisser ticket client' },
  { id: 'recu', libelle: 'J’ai reçu de la marchandise', detail: 'Le stock augmente', icone: 'camion', route: 'stock?vue=reception', permission: 'stock.ajuster', mots: 'reception livraison arrivage fournisseur entree stock carton' },
  { id: 'compter', libelle: 'Je compte mon stock', detail: 'Inventaire, tout ou une partie', icone: 'inventaire', route: 'stock?vue=inventaire', permission: 'stock.ajuster', mots: 'inventaire comptage compter' },
  { id: 'perte', libelle: 'J’ai perdu / cassé / périmé', detail: 'Le stock baisse, la perte est chiffrée', icone: 'alerte', route: 'stock?vue=perte', permission: 'stock.ajuster', mots: 'perte casse vol perime abime retirer' },
  { id: 'depense', libelle: 'J’ai payé une dépense', detail: 'Loyer, transport, électricité…', icone: 'depenses', route: 'depenses?nouveau=1', permission: 'depenses.gerer', mots: 'depense frais loyer transport electricite sortie argent' },
  { id: 'fermer', libelle: 'Fermer ma caisse', detail: 'Compter les billets du jour', icone: 'cloture', route: 'clotures', permission: 'cloture.cloturer', mots: 'cloture fermer fin journee billets z' },
  { id: 'doit', libelle: 'Qui me doit de l’argent ?', detail: 'Clients à relancer', icone: 'clients', route: 'qui-me-doit', mots: 'dette credit creance doit impaye relance' },
  { id: 'commander', libelle: 'Je dois commander', detail: 'Ce qui va manquer', icone: 'panier', route: 'achats?onglet=reappro', permission: 'achats.lire', mots: 'commander commande achat reapprovisionner manque fournisseur' },
  { id: 'je-dois', libelle: 'À qui je dois ?', detail: 'Fournisseurs à payer', icone: 'echeance', route: 'achats?onglet=a_payer', permission: 'achats.lire', mots: 'fournisseur payer dette' },
  { id: 'article', libelle: 'Ajouter des articles', detail: 'Un nom et un prix suffisent', icone: 'articles', route: 'articles?nouveau=1', permission: 'articles.gerer', mots: 'article produit prix catalogue nouveau' },
  { id: 'facture', libelle: 'Faire une facture', detail: 'Ou un devis', icone: 'facture', route: 'factures/nouvelle-facture', permission: 'facturation.gerer', mots: 'facture devis facturer' },
  { id: 'chiffres', libelle: 'Voir mes chiffres', detail: 'Tableau de bord', icone: 'graphique', route: 'tableau-de-bord', permission: 'tableau_de_bord.lire', mots: 'chiffres tableau bord statistiques benefice' },
];

const page = (route) => route.split(/[/?]/)[0];

// Boutons visibles : écran accessible (module actif + droit de lecture) et, s'il est précisé, droit d'agir.
export function boutonsAccessibles(pagesOuvertes, peut, boutons = GROS_BOUTONS) {
  const ids = new Set(pagesOuvertes.map((p) => p.id));
  return boutons.filter((b) => ids.has(page(b.route)) && (!b.permission || peut(b.permission)));
}

// Barre « Je veux… » : gros boutons, créations rapides et écrans du menu, les plus pertinents d'abord.
export function chercherIntention(texte, { boutons = [], actions = [], pages = [] } = {}) {
  if (!String(texte ?? '').trim()) return [];
  const candidats = [
    ...boutons.map((b) => ({ id: `b-${b.id}`, libelle: b.libelle, route: b.route, icone: b.icone, mots: b.mots })),
    ...actions.map((a) => ({ id: `a-${a.id}`, libelle: a.libelle, route: a.route, icone: a.icone, mots: a.mots })),
    ...pages.map((p) => ({ id: `p-${p.id}`, libelle: p.libelle, route: p.id, icone: p.icone, mots: p.groupe })),
  ];
  const vus = new Set();
  return candidats
    .filter((c) => correspond(texte, c.libelle, c.mots ?? ''))
    .map((c) => ({ ...c, pertinence: score(texte, c.libelle) }))
    .sort((a, b) => b.pertinence - a.pertinence)
    .filter((c) => (vus.has(c.route) ? false : vus.add(c.route)))
    .slice(0, 6);
}

// Liste « À faire aujourd'hui » à partir des chiffres déjà chargés. Chaque ligne mène à l'écran qui règle le point.
export function aFaire({ tdb, caissesAnciennes = 0, facturesEnRetard = 0, peremptions = null, devise }) {
  const liste = [];
  if (caissesAnciennes > 0) liste.push({ id: 'caisse', ton: 'rouge', texte: `${caissesAnciennes} caisse(s) d’un jour précédent pas encore fermée(s)`, route: 'clotures' });
  const bas = tdb?.stock_bas ?? [];
  if (bas.length) liste.push({ id: 'stock', ton: 'orange', texte: `${bas.length >= 10 ? '10 ou plus' : bas.length} article(s) à commander (${bas.slice(0, 3).map((a) => a.nom).join(', ')}${bas.length > 3 ? '…' : ''})`, route: 'achats?onglet=reappro' });
  const perimes = (peremptions ?? []).length;
  if (perimes) liste.push({ id: 'peremption', ton: 'orange', texte: `${perimes} lot(s) périmé(s) ou qui périment bientôt`, route: 'stock?vue=peremptions' });
  if (Number(tdb?.creances) > 0) liste.push({ id: 'creances', ton: 'bleu', texte: `Des clients vous doivent ${formatMontant(tdb.creances, devise)}`, route: 'qui-me-doit' });
  if (facturesEnRetard > 0) liste.push({ id: 'factures', ton: 'orange', texte: `${facturesEnRetard} facture(s) en retard de paiement`, route: 'factures?onglet=retards' });
  return liste;
}

// Bilan du jour à envoyer sur WhatsApp (le gérant l'envoie à lui-même ou au patron).
export function texteBilanDuJour({ nom, date, tdb, devise }) {
  const m = (n) => formatMontant(Number(n ?? 0), devise);
  const benefice = Number(tdb?.marge_brute ?? 0) - Number(tdb?.depenses ?? 0);
  const lignes = [
    `Bilan du ${date} — ${nom}`,
    `Ventes : ${m(tdb?.chiffre_affaires)} (${tdb?.nombre_ventes ?? 0} vente(s))`,
    `Argent encaissé : ${m(tdb?.encaissements)}`,
    `Dépenses : ${m(tdb?.depenses)}`,
    `Bénéfice estimé : ${m(benefice)}`,
  ];
  const top = (tdb?.top_articles ?? []).slice(0, 3);
  if (top.length) lignes.push(`Meilleures ventes : ${top.map((t) => t.libelle).join(', ')}`);
  const bas = tdb?.stock_bas ?? [];
  if (bas.length) lignes.push(`À commander : ${bas.slice(0, 5).map((a) => a.nom).join(', ')}`);
  return lignes.join('\n');
}

export function lienWhatsapp(texte, telephone) {
  const numero = String(telephone ?? '').replace(/\D/g, '');
  return `https://wa.me/${numero}?text=${encodeURIComponent(texte)}`;
}
