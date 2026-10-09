import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Marketing = lazy(() => import('./Marketing.jsx'));

export default {
  module: 'marketing',
  pages: [
    { id: 'marketing', libelle: 'Marketing', icone: 'message', groupe: 'Relations', ordre: 12, permission: 'marketing.lire', composant: Marketing },
  ],
  widgets: [],
};
