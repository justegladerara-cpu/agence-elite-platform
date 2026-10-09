import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Projets = lazy(() => import('./Projets.jsx'));

export default {
  module: 'projets',
  pages: [
    { id: 'projets', libelle: 'Projets', icone: 'dossier', groupe: 'Organisation', ordre: 5, permission: 'projets.lire', composant: Projets },
  ],
  widgets: [],
};
