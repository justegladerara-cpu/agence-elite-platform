import Agenda from './Agenda.jsx';
import { SyntheseAgenda } from './widgets.jsx';

export default {
  module: 'agenda',
  pages: [
    { id: 'agenda', libelle: 'Agenda', icone: 'calendrier', groupe: 'Relations', ordre: 20, permission: 'agenda.lire', composant: Agenda },
  ],
  widgets: [
    { id: 'agenda.synthese', zone: 'section', ordre: 6, permission: 'agenda.lire', composant: SyntheseAgenda },
  ],
};
