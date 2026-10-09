// Contrats : libellés et calculs du registre des engagements (la base contrôle tout de son côté).
export const STATUTS_CONTRAT = {
  brouillon: ['Brouillon', 'neutre'], actif: ['En cours', 'vert'], suspendu: ['Suspendu', 'orange'],
  termine: ['Terminé', 'neutre'], resilie: ['Résilié', 'alerte'], annule: ['Annulé', 'neutre'],
};
export const PERIODICITES = { unique: 'Montant unique', mensuelle: 'Par mois', trimestrielle: 'Par trimestre', annuelle: 'Par an' };
export const SENS = { client: 'Client', fournisseur: 'Fournisseur' };

export function montantAnnuel(k) {
  const fois = { mensuelle: 12, trimestrielle: 4 }[k.periodicite] ?? 1;
  return Math.round(Number(k.montant) * fois * 100) / 100;
}

function decaler(date, jours) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + jours * 86400000).toISOString().slice(0, 10);
}

// Date limite pour dénoncer un contrat à reconduction tacite (fin moins préavis).
export function dateLimitePreavis(k) {
  if (!k.fin || !k.reconduction_tacite) return null;
  return decaler(k.fin, -Number(k.preavis_jours || 0));
}

// À surveiller : fin ou date limite de préavis dans la fenêtre d'alerte (contrats en cours ou suspendus).
export function surveillance(k, aujourdhui, alerteJours) {
  if (!['actif', 'suspendu'].includes(k.statut)) return null;
  const limite = decaler(aujourdhui, alerteJours);
  const preavis = dateLimitePreavis(k);
  if (preavis && preavis >= aujourdhui && preavis <= limite) return 'preavis';
  if (k.fin && k.fin >= aujourdhui && k.fin <= limite) return 'fin';
  if (k.fin && k.fin < aujourdhui) return 'echu';
  return null;
}
