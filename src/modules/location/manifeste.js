import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Location = lazy(() => import('./Location.jsx'));

export default {
  module: 'location',
  pages: [
    { id: 'location', libelle: 'Location', icone: 'cle', groupe: 'Vente', ordre: 60, permission: 'location.lire', composant: Location },
  ],
  widgets: [],
};
