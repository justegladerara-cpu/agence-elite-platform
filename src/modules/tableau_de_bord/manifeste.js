import { lazy } from 'react';
const TableauDeBord = lazy(() => import('./TableauDeBord.jsx'));

export default {
  module: 'tableau_de_bord',
  pages: [
    { id: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau', groupe: 'Pilotage', ordre: 10, permission: 'tableau_de_bord.lire', composant: TableauDeBord },
  ],
  widgets: [],
};
