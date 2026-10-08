import { lazy } from 'react';
const Abonnements = lazy(() => import('./Abonnements.jsx'));

export default {
  module: 'abonnements',
  pages: [
    { id: 'abonnements', libelle: 'Abonnements', icone: 'repeter', groupe: 'Vente', ordre: 26, permission: 'abonnements.lire', composant: Abonnements },
  ],
  widgets: [],
};
