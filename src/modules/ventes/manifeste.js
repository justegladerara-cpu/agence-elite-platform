import { lazy } from 'react';
const Ventes = lazy(() => import('./Ventes.jsx'));

export default {
  module: 'ventes',
  pages: [
    { id: 'ventes', libelle: 'Ventes', icone: 'ventes', groupe: 'Vente', ordre: 20, permission: 'ventes.lire', composant: Ventes },
  ],
  widgets: [],
};
