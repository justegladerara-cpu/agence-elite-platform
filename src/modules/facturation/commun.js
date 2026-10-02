// Libellés et calculs partagés par les écrans de facturation (la base recalcule tout de son côté).
export const TYPES_DOCUMENT = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' };
export const STATUTS_DOCUMENT = {
  brouillon: ['Brouillon', 'neutre'], envoye: ['Envoyé', 'bleu'], accepte: ['Accepté', 'vert'], refuse: ['Refusé', 'alerte'],
  converti: ['Facturé', 'vert'], emise: ['Émise', 'bleu'], annule: ['Annulé', 'neutre'],
};

// État lisible d'un document : pour une facture émise, selon ses paiements et son échéance.
export function etatDocument(doc, vente, aujourdhui) {
  if (doc.type === 'avoir') return ['Avoir', 'neutre'];
  if (doc.type === 'devis' && ['envoye', 'brouillon'].includes(doc.statut) && doc.echeance && doc.echeance < aujourdhui) return ['Expiré', 'orange'];
  if (doc.type !== 'facture' || doc.statut !== 'emise' || !vente) return STATUTS_DOCUMENT[doc.statut] ?? [doc.statut, 'neutre'];
  if (vente.statut_paiement === 'payee') return ['Payée', 'vert'];
  if (doc.echeance && doc.echeance < aujourdhui) return ['En retard', 'rouge'];
  if (vente.statut_paiement === 'partielle') return ['Partiellement payée', 'orange'];
  return ['À payer', 'attention'];
}

export function calculerLigne(l) {
  const quantite = Number(l.quantite) || 0;
  const prix = Number(l.prix_unitaire) || 0;
  const remise = Number(l.remise) || 0;
  const taux = Number(l.taux_tva) || 0;
  const ht = Math.round((quantite * prix - remise) * 100) / 100;
  const tva = Math.round(ht * taux) / 100;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

export function totaux(lignes) {
  return lignes.reduce((t, l) => {
    const c = calculerLigne(l);
    return { ht: t.ht + c.ht, tva: t.tva + c.tva, ttc: t.ttc + c.ttc };
  }, { ht: 0, tva: 0, ttc: 0 });
}
