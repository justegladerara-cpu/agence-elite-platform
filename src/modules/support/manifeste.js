import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Support = lazy(() => import('./Support.jsx'));

export default {
  module: 'support_tickets',
  pages: [
    { id: 'support', libelle: 'Support', icone: 'message', groupe: 'Relations', ordre: 25, permission: 'support_tickets.lire', composant: Support },
  ],
  widgets: [],
};
