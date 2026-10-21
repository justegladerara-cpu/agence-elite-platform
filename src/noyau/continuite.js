// Continuité de la caisse (Elite License Guard) : quand seule l'échéance de la licence est dépassée, ces gestes de
// vente et d'encaissement restent possibles. Même liste que public.permissions_continuite() (migration 151).
export const PERMISSIONS_CONTINUITE = new Set([
  'caisse.utiliser', 'caisse.rattraper', 'caisse.reserve', 'caisse.offerts_pertes', 'cloture.cloturer',
  'ventes.annuler', 'ventes.retourner', 'paiements.encaisser', 'fidelite.utiliser',
  'restaurant_salle.servir', 'restaurant_salle.encaisser', 'restaurant_salle.affecter', 'restaurant_salle.transferer',
  'hotel_reservations.sejour', 'scolaire.encaisser', 'immo_locations.encaisser',
]);

// Vrai quand l'écriture est coupée seulement par l'échéance : établissement et client actifs, licence ni suspendue
// ni terminée. Une suspension manuelle ou un mode dirigeant / support ne passe jamais.
export function caisseContinue(etablissement) {
  if (!etablissement || etablissement.ecriture) return false;
  if (['dirigeant', 'support'].includes(etablissement.role)) return false;
  if (etablissement.statut !== 'actif' || etablissement.client_statut !== 'actif') return false;
  return etablissement.licence?.statut === 'active';
}

export const peutEcrire = (etablissement, permission) =>
  Boolean(etablissement?.ecriture || permission.endsWith('.lire') || (caisseContinue(etablissement) && PERMISSIONS_CONTINUITE.has(permission)));

// État lisible d'une licence (même règle que public.licence_etat ; palierMax = plus grand palier d'alerte).
export function etatLicence(l, palierMax = 30) {
  if (!l) return 'aucune';
  if (l.statut === 'terminee' || l.statut === 'suspendue') return l.statut;
  if (l.echeance == null || l.jours_restants == null) return 'sans_echeance';
  const j = l.jours_restants;
  const grace = l.formule === 'essai' ? 0 : 7;
  if (j > palierMax) return 'a_jour';
  if (j > 7) return 'bientot';
  if (j > 0) return 'urgent';
  if (j === 0) return 'aujourdhui';
  return -j <= grace ? 'grace' : 'expiree';
}

export const ETATS_LICENCE = {
  aucune: ['Aucune licence', 'alerte'],
  a_jour: ['À jour', 'vert'],
  sans_echeance: ['Sans échéance', 'vert'],
  bientot: ['Échéance proche', 'attention'],
  urgent: ['À renouveler', 'attention'],
  aujourdhui: ['Échéance aujourd’hui', 'alerte'],
  grace: ['Délai de grâce', 'alerte'],
  expiree: ['Expirée', 'alerte'],
  suspendue: ['Suspendue', 'alerte'],
  terminee: ['Terminée', 'neutre'],
};
