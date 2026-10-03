import Abonnements from './Abonnements.jsx';

export default {
  module: 'abonnements',
  pages: [
    { id: 'abonnements', libelle: 'Abonnements', icone: 'repeter', groupe: 'Vente', ordre: 26, permission: 'abonnements.lire', composant: Abonnements },
  ],
  widgets: [],
};
