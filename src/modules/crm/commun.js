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
