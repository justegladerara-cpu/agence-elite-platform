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
