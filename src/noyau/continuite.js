// Continuité de la caisse (Elite License Guard) : quand seule l'échéance de la licence est dépassée, ces gestes de
// vente et d'encaissement restent possibles. Même liste que public.permissions_continuite() (migration 151).
export const PERMISSIONS_CONTINUITE = new Set([
  'caisse.utiliser', 'caisse.rattraper', 'caisse.reserve', 'caisse.offerts_pertes', 'cloture.cloturer',
  'ventes.annuler', 'ventes.retourner', 'paiements.encaisser', 'fidelite.utiliser',
  'restaurant_salle.servir', 'restaurant_salle.encaisser', 'restaurant_salle.affecter', 'restaurant_salle.transferer',
  'hotel_reservations.sejour', 'scolaire.encaisser', 'immo_locations.encaisser',
]);

// Heure de fin précise d'une licence (licences.fin_a, migration 154) : passée cette heure, consultation seule et caisse
// fermée. Seuls restent permis l'envoi des ventes faites hors ligne avant la coupure et le ticket Z (même liste que
// public.permissions_apres_coupure()).
export const PERMISSIONS_APRES_COUPURE = new Set(['caisse.rattraper', 'cloture.cloturer']);

export function finLicence(etablissement) {
  const fin = etablissement?.licence?.fin_a;
  if (!fin || etablissement.licence.statut !== 'active') return null;
  const t = new Date(fin).getTime();
  return Number.isFinite(t) ? t : null;
}

export function licenceCoupee(etablissement, maintenant = Date.now()) {
  const fin = finLicence(etablissement);
  return fin != null && maintenant >= fin;
}

// Vrai quand l'écriture est coupée seulement par l'échéance : établissement et client actifs, licence ni suspendue
// ni terminée. Une suspension manuelle ou un mode dirigeant / support ne passe jamais.
export function caisseContinue(etablissement) {
  if (!etablissement || etablissement.ecriture) return false;
  if (['dirigeant', 'support'].includes(etablissement.role)) return false;
  if (etablissement.statut !== 'actif' || etablissement.client_statut !== 'actif') return false;
  if (licenceCoupee(etablissement)) return false;
  return etablissement.licence?.statut === 'active';
}

export function peutEcrire(etablissement, permission) {
  if (permission.endsWith('.lire')) return true;
  if (licenceCoupee(etablissement)) return PERMISSIONS_APRES_COUPURE.has(permission);
  return Boolean(etablissement?.ecriture || (caisseContinue(etablissement) && PERMISSIONS_CONTINUITE.has(permission)));
}

// Temps restant lisible : « 1 j 22 h 14 min ».
export function tempsRestant(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const j = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return `${j ? `${j} j ` : ''}${j || h ? `${h} h ` : ''}${m} min`;
}

// « samedi 24 octobre à 12h00 (heure de Brazzaville) » : toujours dans le fuseau de l'établissement.
export function dateFinLisible(ms, fuseau = 'Africa/Brazzaville') {
  const d = new Date(ms);
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fuseau }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: fuseau }).format(d).replace(':', 'h');
  return `${jour} à ${heure} (heure de ${fuseau === 'Africa/Brazzaville' ? 'Brazzaville' : fuseau})`;
}

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
