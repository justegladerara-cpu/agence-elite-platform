import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Abonnements = lazy(() => import('./Abonnements.jsx'));

export default {
  module: 'abonnements',
  pages: [
    { id: 'abonnements', libelle: 'Abonnements', icone: 'repeter', groupe: 'Vente', ordre: 26, permission: 'abonnements.lire', composant: Abonnements },
  ],
  widgets: [],
};
