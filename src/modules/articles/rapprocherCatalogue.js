// Rapprochement conservateur d'un catalogue importé avec les articles déjà enregistrés.
// Ne modifie aucune donnée. Toute divergence de prix ou de variante reste à examiner.
export function normaliserNomArticle(valeur) {
  return String(valeur ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const prix = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : null;
};

export function rapprocherCatalogue(existants, entrants) {
  const indexNom = new Map();
  const indexReference = new Map();
  for (const article of existants) {
    const nom = normaliserNomArticle(article.nom);
    indexNom.set(nom, [...(indexNom.get(nom) ?? []), article]);
    if (article.reference) {
      const ref = String(article.reference).trim().toLowerCase();
      indexReference.set(ref, [...(indexReference.get(ref) ?? []), article]);
    }
  }
  const correspondances = entrants.map((article, index) => {
    const base = { index, reference: article.reference ?? null, nom: article.nom, statut: '', article_existant_id: null, raison: '' };
    const actif = article.actif === true || String(article.actif).toLowerCase() === 'oui';
    if (!actif || prix(article.prix_vente ?? article.prix) === null) {
      return { ...base, statut: 'en_attente', raison: article.motif_attente ?? 'Article inactif ou prix absent' };
    }
    const reference = String(article.reference ?? '').trim().toLowerCase();
    const parRef = reference ? (indexReference.get(reference) ?? []) : [];
    const parNom = indexNom.get(normaliserNomArticle(article.nom)) ?? [];
    const candidats = parRef.length ? parRef : parNom;
    if (!candidats.length) return { ...base, statut: 'a_examiner', raison: 'Aucune correspondance exacte ; rechercher les synonymes et conditionnements avant création' };
    if (candidats.length !== 1) return { ...base, statut: 'conflit', raison: 'Plusieurs correspondances possibles' };
    const ancien = candidats[0];
    const memeNom = normaliserNomArticle(ancien.nom) === normaliserNomArticle(article.nom);
    const memePrix = prix(ancien.prix_vente) === prix(article.prix_vente ?? article.prix);
    const memeVariante = normaliserNomArticle(ancien.variante) === normaliserNomArticle(article.variante);
    const memeUnite = !article.unite || normaliserNomArticle(ancien.unite) === normaliserNomArticle(article.unite);
    const raison = !memeNom ? 'Nom différent' : !memePrix ? 'Prix différent' : !memeVariante ? 'Variante différente' : !memeUnite ? 'Unité différente' : '';
    return { ...base, article_existant_id: ancien.id, statut: raison ? 'conflit' : 'identique', raison: raison || 'Nom, prix, variante et unité compatibles' };
  });
  const idsRapproches = new Set(correspondances.filter(x => x.statut === 'identique').map(x => x.article_existant_id));
  return {
    correspondances,
    historiques_uniquement: existants.filter(x => !idsRapproches.has(x.id)).map(x => ({ id: x.id, nom: x.nom })),
    bilan: Object.fromEntries(['identique', 'conflit', 'a_examiner', 'en_attente'].map(statut => [statut, correspondances.filter(x => x.statut === statut).length])),
  };
}
