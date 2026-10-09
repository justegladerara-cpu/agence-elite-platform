import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Rapports = lazy(() => import('./Rapports.jsx'));

export default {
  module: 'rapports',
  pages: [
    { id: 'rapports', libelle: 'Rapports', icone: 'graphique', groupe: 'Pilotage', ordre: 20, permission: 'rapports.lire', composant: Rapports },
  ],
  widgets: [],
};
