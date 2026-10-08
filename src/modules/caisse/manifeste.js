import { lazy } from 'react';
const Caisse = lazy(() => import('./Caisse.jsx'));

export default {
  module: 'caisse',
  pages: [
    { id: 'caisse', libelle: 'Caisse', icone: 'caisse', groupe: 'Vente', ordre: 10, permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
  ],
  widgets: [],
};
