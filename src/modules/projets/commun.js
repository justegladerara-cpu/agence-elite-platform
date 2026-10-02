// Libellés partagés du module Projets.
export const STATUTS_PROJET = {
  a_venir: ['À venir', 'neutre'], en_cours: ['En cours', 'bleu'], en_pause: ['En pause', 'orange'],
  termine: ['Terminé', 'vert'], annule: ['Annulé', 'neutre'],
};
export const COLONNES_TACHES = [['a_faire', 'À faire'], ['en_cours', 'En cours'], ['en_revue', 'À vérifier'], ['terminee', 'Terminée']];
export const PRIORITES = { basse: ['Basse', 'neutre'], normale: ['Normale', 'neutre'], haute: ['Haute', 'orange'], urgente: ['Urgente', 'rouge'] };
export const heures = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
