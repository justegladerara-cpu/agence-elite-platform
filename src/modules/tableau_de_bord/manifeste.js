import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const TableauDeBord = lazy(() => import('./TableauDeBord.jsx'));

export default {
  module: 'tableau_de_bord',
  pages: [
    { id: 'tableau-de-bord', libelle: 'Tableau de bord', icone: 'tableau', groupe: 'Pilotage', ordre: 10, permission: 'tableau_de_bord.lire', composant: TableauDeBord },
  ],
  widgets: [],
};
