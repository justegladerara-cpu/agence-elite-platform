import { lazy } from 'react';
const Depenses = lazy(() => import('./Depenses.jsx'));

export default {
  module: 'depenses',
  pages: [
    { id: 'depenses', libelle: 'Dépenses', icone: 'depenses', groupe: 'Relations', ordre: 20, permission: 'depenses.lire', composant: Depenses },
  ],
  widgets: [],
};
