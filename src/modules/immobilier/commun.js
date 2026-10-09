// Libellés partagés des écrans de gestion immobilière.
export const TYPES_BIEN = {
  immeuble: 'Immeuble', appartement: 'Appartement', studio: 'Studio', villa: 'Villa', maison: 'Maison', chambre: 'Chambre',
  local: 'Local commercial', bureau: 'Bureau', entrepot: 'Entrepôt', terrain: 'Terrain',
};

export const STATUTS_BIEN = {
  libre: ['Libre', 'vert'], loue: ['Loué', 'bleu'], reserve: ['Réservé', 'attention'], travaux: ['En travaux', 'attention'],
  a_vendre: ['À vendre', 'bleu'], vendu: ['Vendu', 'neutre'],
};

export const STATUTS_BAIL = { actif: ['Actif', 'vert'], resilie: ['Résilié', 'neutre'], termine: ['Terminé', 'neutre'] };

export const STATUTS_ECHEANCE = {
  a_payer: ['À payer', 'attention'], partielle: ['Partielle', 'attention'], payee: ['Payée', 'vert'], annulee: ['Annulée', 'neutre'],
};

export const MODES_IMMO = { especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement', cheque: 'Chèque' };

export const PRIORITES = { basse: ['Basse', 'neutre'], normale: ['Normale', 'bleu'], haute: ['Haute', 'attention'], urgente: ['Urgente', 'alerte'] };

export const STATUTS_INCIDENT = { ouvert: ['Ouvert', 'attention'], en_cours: ['En cours', 'bleu'], resolu: ['Résolu', 'vert'], annule: ['Annulé', 'neutre'] };

export const A_CHARGE = { proprietaire: 'Propriétaire', locataire: 'Locataire', agence: 'Agence' };

export const STATUTS_REVERSEMENT = { prepare: ['Préparé', 'attention'], paye: ['Payé', 'vert'], annule: ['Annulé', 'neutre'] };

export function libellePeriode(periode) {
  if (!periode) return '';
  const d = new Date(`${String(periode).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
