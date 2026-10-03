// Statuts d'une commande en ligne : [libellé, ton du badge].
export const STATUTS_COMMANDE = {
  nouvelle: ['Nouvelle', 'bleu'],
  confirmee: ['Confirmée', 'orange'],
  preparee: ['Prête', 'orange'],
  expediee: ['En livraison', 'violet'],
  livree: ['Livrée', 'vert'],
  annulee: ['Annulée', 'neutre'],
  retournee: ['Retournée', 'rouge'],
};

export const MODES_REMISE = { livraison: 'Livraison', retrait: 'Retrait sur place' };

// Étape suivante proposée au personnel : [statut, libellé du bouton].
export function etapeSuivante(c) {
  if (c.statut === 'confirmee') return ['preparee', 'Marquer prête'];
  if (c.statut === 'preparee') return c.mode_livraison === 'livraison' ? ['expediee', 'Partie en livraison'] : ['livree', 'Remise au client'];
  if (c.statut === 'expediee') return ['livree', 'Livrée'];
  return null;
}
