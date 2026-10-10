// Quantité d'un article sur un Hub (ou la somme sur les Hubs visibles), à partir de useStockHubs.
export function quantiteHub(donnees, articleId, hubId, hubsVisibles) {
  const parHub = donnees?.parArticle[articleId] ?? {};
  if (hubId) return parHub[hubId] ?? 0;
  return hubsVisibles.reduce((s, h) => s + (parHub[h.id] ?? 0), 0);
}
