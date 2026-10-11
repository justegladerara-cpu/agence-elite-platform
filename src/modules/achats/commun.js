// Libellés et tons partagés du module Achats (la base recalcule tout de son côté).
export const STATUTS_COMMANDE = {
  demande: ['Demande', 'bleu'],
  brouillon: ['Brouillon', 'neutre'],
  envoyee: ['Envoyée', 'bleu'],
  partielle: ['Reçue en partie', 'orange'],
  recue: ['Reçue', 'vert'],
  annulee: ['Annulée', 'neutre'],
};

export const resteAPayer = (c) => Math.max(0, Number(c.montant_recu) - Number(c.montant_paye));

// État affiché : réception d'abord, puis dette fournisseur (en retard si l'échéance est passée).
export function etatCommande(c, aujourdhui) {
  if (['recue', 'partielle'].includes(c.statut) && resteAPayer(c) > 0 && c.echeance && c.echeance < aujourdhui) return ['À payer, en retard', 'rouge'];
  if (c.statut === 'recue') return resteAPayer(c) > 0 ? ['Reçue, à payer', 'attention'] : ['Reçue et payée', 'vert'];
  if (c.statut === 'envoyee' && c.livraison_prevue && c.livraison_prevue < aujourdhui) return ['Livraison en retard', 'orange'];
  return STATUTS_COMMANDE[c.statut] ?? [c.statut, 'neutre'];
}

// Prix d'achat en hausse à la réception : marge actuelle (prix de vente, ancien coût) → marge avec le nouveau coût.
// null si le prix n'augmente pas ou si l'on ne peut pas calculer (pas de prix de vente, pas d'ancien coût).
export function hausseCoutAchat(prixVente, ancienCout, nouveauCout) {
  if (ancienCout === null || ancienCout === undefined || ancienCout === '' || String(nouveauCout ?? '').trim() === '') return null;
  const pv = Number(prixVente);
  const avant = Number(ancienCout);
  const apres = Number(String(nouveauCout).replace(',', '.'));
  if (!(pv > 0) || !Number.isFinite(avant) || !Number.isFinite(apres) || apres <= avant) return null;
  const marge = (cout) => Math.round(((pv - cout) / pv) * 1000) / 10;
  return { margeAvant: marge(avant), margeApres: marge(apres) };
}
