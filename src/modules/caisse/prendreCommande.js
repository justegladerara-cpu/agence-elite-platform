// Panier du serveur (écran « Prendre une commande ») : logique pure, testée sans écran.

// Un toucher = un de plus ; l'article garde sa place dans la liste.
export function ajouterArticle(lignes, articleId) {
  return lignes.some((l) => l.article_id === articleId)
    ? lignes.map((l) => (l.article_id === articleId ? { ...l, quantite: l.quantite + 1 } : l))
    : [...lignes, { article_id: articleId, quantite: 1 }];
}

// + ou − ; à zéro la ligne disparaît.
export function changerQuantite(lignes, articleId, ecart) {
  return lignes
    .map((l) => (l.article_id === articleId ? { ...l, quantite: l.quantite + ecart } : l))
    .filter((l) => l.quantite > 0);
}

export function totalCommande(lignes, articlesParId) {
  return lignes.reduce((t, l) => t + Number(articlesParId[l.article_id]?.prix_vente ?? 0) * l.quantite, 0);
}

// Ce que reçoit envoyer_commande_caisse : article et quantité seulement (le prix est relu par la base).
export function lignesAEnvoyer(lignes) {
  return lignes.filter((l) => l.quantite > 0).map((l) => ({ article_id: l.article_id, quantite: l.quantite }));
}
