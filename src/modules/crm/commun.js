// Libellés partagés du CRM.
export const SOURCES = {
  instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', appel: 'Appel', recommandation: 'Recommandation',
  site: 'Site web', salon: 'Salon, événement', passage: 'Passage en boutique', autre: 'Autre',
};
export const TYPES_ACTIVITE = {
  appel: 'Appel', message: 'Message', rdv: 'Rendez-vous', email: 'E-mail', visite: 'Visite', demo: 'Démo', tache: 'Tâche', note: 'Note',
};
export const STATUTS_OPPORTUNITE = { ouverte: ['En cours', 'bleu'], gagnee: ['Gagnée', 'vert'], perdue: ['Perdue', 'neutre'] };

// Valeur pour un champ <input type="datetime-local"> (heure locale du navigateur).
export function dateHeureLocale(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
export const versIso = (local) => (local ? new Date(local).toISOString() : null);

// Qualification (lot D).
export const TYPES_CRITERE = { oui_non: 'Oui / non', choix: 'Choix dans une liste', nombre: 'Nombre', texte: 'Texte libre' };
export const GROUPES_CRITERE = { qualification: 'Qualification', audit: 'Questionnaire d’audit' };
export const REGLAGES_DEFAUT = {
  motifs_perte: ['Prix trop élevé', 'Choix d’un concurrent', 'Pas de budget', 'Projet reporté', 'Sans réponse', 'Besoin non couvert'],
  modele_compte_rendu: 'Besoin :\nObjections :\nProchaine étape :',
  relance_jours: 3,
};
// Activités dont le résultat suit le modèle de compte rendu.
export const AVEC_COMPTE_RENDU = ['appel', 'rdv', 'visite', 'demo'];
export const DELAIS_RELANCE = [['', 'Pas de relance'], ['30', 'Dans 1 mois'], ['90', 'Dans 3 mois'], ['180', 'Dans 6 mois']];

// Une question conditionnelle n'est posée que si la question dont elle dépend a reçu la réponse attendue.
export function criteresVisibles(criteres, reponses) {
  return criteres.filter((k) => k.actif && (!k.depend_de || reponses[k.depend_de] === k.depend_valeur));
}

// Date de relance à 9 h (heure du navigateur), dans n jours.
export function relanceDans(jours, depuis = new Date()) {
  const d = new Date(depuis);
  d.setDate(d.getDate() + Number(jours));
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export const fourchette = (o, montant) => {
  const min = o.budget_min != null ? montant(o.budget_min) : null;
  const max = o.budget_max != null ? montant(o.budget_max) : null;
  if (min && max) return `${min} à ${max}`;
  if (min) return `à partir de ${min}`;
  if (max) return `jusqu’à ${max}`;
  return null;
};
