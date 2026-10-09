import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Assistant = lazy(() => import('./Assistant.jsx'));

export default {
  module: 'assistant',
  pages: [
    { id: 'assistant', libelle: 'Assistant', icone: 'alerte', groupe: 'Pilotage', ordre: 15, permission: 'assistant.lire', composant: Assistant },
  ],
  widgets: [],
};
