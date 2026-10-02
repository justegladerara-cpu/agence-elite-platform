// Libellés et outils partagés par les écrans RH.
export const TYPES_CONTRAT = {
  cdi: 'CDI', cdd: 'CDD', stage: 'Stage', apprentissage: 'Apprentissage', prestation: 'Prestation', journalier: 'Journalier', autre: 'Autre',
};
export const PERIODICITES = { mensuel: 'par mois', journalier: 'par jour', horaire: 'par heure', forfait: 'forfait' };
export const TYPES_ABSENCE = {
  conge_paye: 'Congé payé', maladie: 'Maladie', sans_solde: 'Sans solde', maternite: 'Maternité', paternite: 'Paternité',
  evenement_familial: 'Événement familial', formation: 'Formation', recuperation: 'Récupération', autre: 'Autre',
};
export const STATUTS_ABSENCE = {
  demandee: ['En attente', 'attention'], approuvee: ['Approuvée', 'vert'], refusee: ['Refusée', 'alerte'], annulee: ['Annulée', 'neutre'],
};
export const STATUTS_EMPLOYE = { actif: ['Actif', 'vert'], suspendu: ['Suspendu', 'attention'], sorti: ['Sorti', 'neutre'] };
export const JOURS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [7, 'Dimanche']];
export const JOURS_COURTS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const CATEGORIES_DOCUMENTS_RH = ['Contrat signé', 'Pièce d’identité', 'Diplôme', 'Attestation', 'Certificat médical', 'Avertissement', 'Autre'];

export const nomEmploye = (e) => (e ? `${e.prenom} ${e.nom}` : '');

export function heure(instant) {
  if (!instant) return '—';
  return new Date(instant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function duree(arrivee, depart) {
  if (!arrivee || !depart) return '—';
  const minutes = Math.round((new Date(depart) - new Date(arrivee)) / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

// Date ISO (AAAA-MM-JJ) décalée de n jours, en heure locale du navigateur.
export function decalerDate(iso, jours) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function lundiDe(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const decalage = (d.getDay() + 6) % 7;
  return decalerDate(iso, -decalage);
}

// Charge l'organisation (départements, postes, horaires, employés) visible par la personne.
export async function chargerOrganisation(api, etablissementId) {
  const [departements, postes, horaires, employes] = await Promise.all([
    api.lire('rh_departements', { eq: { etablissement_id: etablissementId }, ordre: ['nom'] }),
    api.lire('rh_postes', { eq: { etablissement_id: etablissementId }, ordre: ['intitule'] }),
    api.lire('rh_horaires', { eq: { etablissement_id: etablissementId }, ordre: ['nom'] }),
    api.lire('rh_employes', { eq: { etablissement_id: etablissementId }, ordre: ['nom'] }),
  ]);
  const index = (liste) => Object.fromEntries(liste.map((x) => [x.id, x]));
  return {
    departements, postes, horaires, employes,
    departement: index(departements), poste: index(postes), horaire: index(horaires), employe: index(employes),
  };
}
