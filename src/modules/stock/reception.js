// Réception intelligente (logique pure, testée sans écran) : conditionnements retenus, prix retenus, coût unitaire,
// alertes de prix. Les mêmes règles sont appliquées par la base (recevoir_marchandise) : l'écran ne fait que prévenir.

export const SEUIL_HAUSSE = 0.05;
export const SEUIL_MARGE = 0.10;

// Prix conseillé arrondi au-dessus : 5 sous 1 000, 25 sous 10 000, 50 au-delà (comme la base).
export function arrondiPrix(prix) {
  if (prix == null || !Number.isFinite(prix)) return null;
  const pas = prix < 1000 ? 5 : prix < 10000 ? 25 : 50;
  return Math.ceil(Math.round(prix * 100) / 100 / pas) * pas;
}

// Conditionnements proposés pour un article : ceux retenus pour ce fournisseur d'abord, puis sans fournisseur, puis
// ceux des autres fournisseurs, enfin le casier réglé sur l'article. Un seul par nombre d'unités.
export function conditionnementsDe(article, memoire, fournisseurId) {
  const rang = (m) => (fournisseurId && m.fournisseur_id === fournisseurId ? 0 : m.fournisseur_id == null ? 1 : 2);
  const liste = (memoire ?? [])
    .filter((m) => m.article_id === article.id)
    .sort((a, b) => rang(a) - rang(b) || String(b.utilise_le).localeCompare(String(a.utilise_le)))
    .map((m) => ({
      nom: m.nom, par: Number(m.unites), prix: m.dernier_prix == null ? null : Number(m.dernier_prix),
      quantite: m.derniere_quantite == null ? null : Number(m.derniere_quantite), fournisseur_id: m.fournisseur_id,
      // Le dernier prix d'un autre fournisseur n'est pas proposé : il ne dit rien du prix de celui-ci.
      prixFiable: !m.fournisseur_id || m.fournisseur_id === fournisseurId,
    }));
  if (article.unites_par_lot) liste.push({ nom: article.nom_lot || 'casier', par: Number(article.unites_par_lot), prix: null, quantite: null, prixFiable: false });
  const vus = new Set();
  return liste.filter((c) => (vus.has(c.par) ? false : vus.add(c.par)));
}

// Conditionnement choisi par défaut : le premier proposé s'il contient plusieurs unités, sinon la saisie à l'unité.
export function conditionnementParDefaut(article, memoire, fournisseurId) {
  return conditionnementsDe(article, memoire, fournisseurId).find((c) => c.par >= 2) ?? null;
}

// Prix retenu pour une saisie : celui du conditionnement (même fournisseur ou sans fournisseur), sinon déduit du coût
// d'achat de l'article. Renvoie { prix, base: 'conditionnement' | 'unite' } ou null.
export function prixRetenu(article, conditionnement, memoire, fournisseurId) {
  const par = conditionnement?.par ?? 1;
  const connu = conditionnementsDe(article, memoire, fournisseurId).find((c) => c.par === par && c.prixFiable && c.prix != null);
  if (connu) return connu.prix;
  if (Number(article.cout_achat) > 0) return Math.round(Number(article.cout_achat) * par * 100) / 100;
  return null;
}

export function coutUnitaire(prix, par) {
  if (prix == null || !Number.isFinite(prix) || prix < 0) return null;
  return Math.round((prix / (par || 1)) * 100) / 100;
}

// Alertes d'une ligne : hausse / baisse du prix d'achat, vente à perte, marge faible ; avec un prix de vente conseillé
// qui garde la marge d'avant (hausse) ou donne 25 % de marge (perte, marge faible).
export function alertesLigne({ cout, ancienCout, prixVente, nouveauPrixVente }) {
  const alertes = [];
  if (cout == null) return alertes;
  const ancien = Number(ancienCout) || 0;
  const pv = Number(nouveauPrixVente ?? prixVente) || 0;
  let conseil = null;
  if (ancien > 0 && cout >= ancien * (1 + SEUIL_HAUSSE)) {
    conseil = Number(prixVente) > 0 ? arrondiPrix((Number(prixVente) * cout) / ancien) : null;
    alertes.push({ type: 'hausse', pourcentage: Math.round(((cout - ancien) * 1000) / ancien) / 10, prixConseille: conseil });
  } else if (ancien > 0 && cout <= ancien * (1 - SEUIL_HAUSSE)) {
    alertes.push({ type: 'baisse', pourcentage: Math.round(((cout - ancien) * 1000) / ancien) / 10 });
  }
  if (pv <= cout) alertes.push({ type: 'vente_a_perte', prixConseille: conseil ?? arrondiPrix(cout * 1.25) });
  else if (pv > 0 && (pv - cout) / pv < SEUIL_MARGE) {
    alertes.push({ type: 'marge_faible', marge: Math.round(((pv - cout) * 1000) / pv) / 10, prixConseille: conseil ?? arrondiPrix(cout * 1.25) });
  }
  return alertes;
}

// « Refaire la dernière livraison » de ce fournisseur : la dernière quantité reçue de chaque article, avec son
// conditionnement. Seuls les conditionnements utilisés le jour de la dernière livraison sont repris.
export function derniereLivraison(memoire, fournisseurId) {
  const siens = (memoire ?? []).filter((m) => fournisseurId && m.fournisseur_id === fournisseurId && Number(m.derniere_quantite) > 0);
  if (!siens.length) return [];
  const jour = (m) => String(m.utilise_le).slice(0, 10);
  const dernier = siens.map(jour).sort().at(-1);
  const parArticle = new Map();
  for (const m of siens.filter((x) => jour(x) === dernier).sort((a, b) => String(b.utilise_le).localeCompare(String(a.utilise_le)))) {
    if (!parArticle.has(m.article_id)) parArticle.set(m.article_id, { article_id: m.article_id, nom: m.nom, par: Number(m.unites), quantite: Number(m.derniere_quantite) });
  }
  return [...parArticle.values()];
}
