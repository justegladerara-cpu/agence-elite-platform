import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Ventes = lazy(() => import('./Ventes.jsx'));

export default {
  module: 'ventes',
  pages: [
    { id: 'ventes', libelle: 'Ventes', icone: 'ventes', groupe: 'Vente', ordre: 20, permission: 'ventes.lire', composant: Ventes },
  ],
  widgets: [],
};
