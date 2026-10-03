import Abonnements from './Abonnements.jsx';
import { SyntheseAbonnements } from './widgets.jsx';

export default {
  module: 'abonnements',
  pages: [
    { id: 'abonnements', libelle: 'Abonnements', icone: 'repeter', groupe: 'Vente', ordre: 26, permission: 'abonnements.lire', composant: Abonnements },
  ],
  widgets: [
    { id: 'abonnements.synthese', zone: 'section', ordre: 41, permission: 'abonnements.lire', composant: SyntheseAbonnements },
  ],
};
