import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Comptabilite = lazy(() => import('./Comptabilite.jsx'));

export default {
  module: 'comptabilite',
  pages: [
    { id: 'comptabilite', libelle: 'Comptabilité', icone: 'activite', groupe: 'Relations', ordre: 25, permission: 'comptabilite.lire', composant: Comptabilite },
  ],
  widgets: [],
};
