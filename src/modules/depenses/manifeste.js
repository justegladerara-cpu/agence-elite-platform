import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Depenses = lazy(() => import('./Depenses.jsx'));

export default {
  module: 'depenses',
  pages: [
    { id: 'depenses', libelle: 'Dépenses', icone: 'depenses', groupe: 'Relations', ordre: 20, permission: 'depenses.lire', composant: Depenses },
  ],
  widgets: [],
};
