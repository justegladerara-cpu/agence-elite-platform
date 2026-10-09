import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Livraisons = lazy(() => import('./Livraisons.jsx'));

export default {
  module: 'livraisons',
  pages: [
    { id: 'livraisons', libelle: 'Livraisons', icone: 'camion', groupe: 'Vente', ordre: 55, permission: 'livraisons.lire', composant: Livraisons },
  ],
  widgets: [],
};
