// Emballages consignés : petits calculs de l'écran (la situation complète vient de situation_emballages).
export const TYPES_MOUVEMENT = {
  recu_fournisseur: 'Reçu du fournisseur',
  rendu_fournisseur: 'Rendu au fournisseur',
  donne_client: 'Confié à un client',
  rendu_client: 'Rapporté par un client',
  ajustement: 'Correction du compte',
};

export function totalConsignes(situation) {
  return (situation ?? []).reduce((s, e) => s + Number(e.consignes_gardees ?? 0), 0);
}

// Emballages encore chez un client d'après ses mouvements (annulés exclus).
export function situationClient(mouvements) {
  return (mouvements ?? []).filter((m) => !m.annule_le).reduce((s, m) => s
    + (m.type === 'donne_client' ? Number(m.quantite) : m.type === 'rendu_client' ? -Number(m.quantite) : 0), 0);
}
