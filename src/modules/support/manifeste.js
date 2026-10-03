import Support from './Support.jsx';
import { SyntheseSupport } from './widgets.jsx';

export default {
  module: 'support_tickets',
  pages: [
    { id: 'support', libelle: 'Support', icone: 'message', groupe: 'Relations', ordre: 25, permission: 'support_tickets.lire', composant: Support },
  ],
  widgets: [
    { id: 'support.synthese', zone: 'section', ordre: 7, permission: 'support_tickets.lire', composant: SyntheseSupport },
  ],
};
