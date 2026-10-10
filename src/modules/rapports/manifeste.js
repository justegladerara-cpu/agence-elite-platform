import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Rapports = lazy(() => import('./Rapports.jsx'));
const Pilotage = lazy(() => import('./Pilotage.jsx'));

export default {
  module: 'rapports',
  pages: [
    { id: 'pilotage', libelle: 'Pilotage', icone: 'cible', groupe: 'Pilotage', ordre: 18, permission: 'rapports.pilotage', composant: Pilotage },
    { id: 'rapports', libelle: 'Rapports', icone: 'graphique', groupe: 'Pilotage', ordre: 20, permission: 'rapports.lire', composant: Rapports },
  ],
  widgets: [],
};
