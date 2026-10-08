import { lazy } from 'react';
const Agenda = lazy(() => import('./Agenda.jsx'));

export default {
  module: 'agenda',
  pages: [
    { id: 'agenda', libelle: 'Agenda', icone: 'calendrier', groupe: 'Relations', ordre: 20, permission: 'agenda.lire', composant: Agenda },
  ],
  widgets: [],
};
