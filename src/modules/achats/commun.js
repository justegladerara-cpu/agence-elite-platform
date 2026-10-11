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

// « À qui je dois ? » : dettes fournisseurs regroupées par fournisseur (marchandise reçue pas encore payée), avec la
// prochaine échéance et ce qui est déjà en retard. Les fournisseurs en retard d'abord, puis l'échéance la plus proche.
export function regrouperDettesFournisseurs(commandes, aujourdhui) {
  const parFournisseur = new Map();
  for (const c of commandes) {
    if (c.statut === 'annulee') continue;
    const reste = resteAPayer(c);
    if (reste <= 0) continue;
    const echeance = c.echeance ? String(c.echeance instanceof Date ? c.echeance.toISOString() : c.echeance).slice(0, 10) : null;
    const retard = Boolean(echeance && echeance < aujourdhui);
    const g = parFournisseur.get(c.fournisseur_id) ?? { fournisseur_id: c.fournisseur_id, total: 0, en_retard: 0, prochaine_echeance: null, commandes: [] };
    g.total = Math.round((g.total + reste) * 100) / 100;
    if (retard) g.en_retard = Math.round((g.en_retard + reste) * 100) / 100;
    if (echeance && (!g.prochaine_echeance || echeance < g.prochaine_echeance)) g.prochaine_echeance = echeance;
    g.commandes.push({ id: c.id, numero: c.numero, reste, echeance, retard });
    parFournisseur.set(c.fournisseur_id, g);
  }
  const cle = (e) => e ?? '9999-12-31';
  for (const g of parFournisseur.values()) g.commandes.sort((a, b) => cle(a.echeance).localeCompare(cle(b.echeance)));
  return [...parFournisseur.values()].sort((a, b) => (b.en_retard > 0) - (a.en_retard > 0)
    || cle(a.prochaine_echeance).localeCompare(cle(b.prochaine_echeance)) || b.total - a.total);
}
