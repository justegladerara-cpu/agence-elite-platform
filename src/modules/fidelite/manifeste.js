import { lazy } from 'react';
const Fidelite = lazy(() => import('./Fidelite.jsx'));

export default {
  module: 'fidelite',
  pages: [
    { id: 'fidelite', libelle: 'Fidélité', icone: 'etoile', groupe: 'Relations', ordre: 28, permission: 'fidelite.lire', composant: Fidelite },
  ],
  widgets: [],
};
