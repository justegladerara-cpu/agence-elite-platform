import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Achats = lazy(() => import('./Achats.jsx'));

export default {
  module: 'achats',
  pages: [
    { id: 'achats', libelle: 'Achats', icone: 'panier', groupe: 'Catalogue et stock', ordre: 35, permission: 'achats.lire', composant: Achats },
  ],
  widgets: [],
};
