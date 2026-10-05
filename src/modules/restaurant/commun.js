// Libellés partagés par la salle et la cuisine.
export const STATUTS_LIGNE = {
  en_attente: ['À envoyer', 'attention'],
  envoyee: ['Envoyé', 'bleu'],
  en_preparation: ['En préparation', 'orange'],
  prete: ['Prêt', 'vert'],
  servie: ['Servi', 'neutre'],
  annulee: ['Annulé', 'rouge'],
};
export const POSTES = { aucun: 'Servi directement', cuisine: 'Cuisine', bar: 'Bar' };

// Minutes écoulées depuis un instant (affichage « il y a 12 min » en cuisine).
export function minutesDepuis(instant, maintenant = Date.now()) {
  if (!instant) return 0;
  return Math.max(0, Math.floor((maintenant - new Date(instant).getTime()) / 60000));
}

// Total d'une liste de plats au prix actuel des articles (c'est ce prix que la caisse encaisse).
export function totalLignes(lignes, articles) {
  return lignes.reduce((s, l) => s + Math.round(Number(articles[l.article_id]?.prix_vente ?? 0) * Number(l.quantite) * 100) / 100, 0);
}

// Désignation complète d'un article (« Château Rodet — Tarif 2 »), comme sur le bon et l'addition.
export function nomArticle(article) {
  return article.variante ? `${article.nom} — ${article.variante}` : article.nom;
}

// Catégories dans l'ordre choisi par l'établissement, puis par nom.
export function trierCategories(categories) {
  return [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr'));
}

// Articles rangés comme le menu : ordre de leur catégorie, puis ordre d'affichage, puis nom.
export function trierArticles(articles, categories) {
  const rang = Object.fromEntries(trierCategories(categories).map((c, i) => [c.id, i]));
  const rangDe = (a) => rang[a.categorie_id] ?? Number.MAX_SAFE_INTEGER;
  return [...articles].sort((a, b) => rangDe(a) - rangDe(b) || (a.ordre_affichage ?? 0) - (b.ordre_affichage ?? 0)
    || a.nom.localeCompare(b.nom, 'fr') || (a.variante ?? '').localeCompare(b.variante ?? '', 'fr'));
}
