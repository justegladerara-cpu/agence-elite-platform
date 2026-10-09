import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Clotures = lazy(() => import('./Clotures.jsx'));

export default {
  module: 'cloture',
  pages: [
    { id: 'clotures', libelle: 'Clôtures', icone: 'cloture', groupe: 'Vente', ordre: 30, permission: 'cloture.lire', composant: Clotures },
  ],
  widgets: [],
};
