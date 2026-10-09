import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Boutique = lazy(() => import('./Boutique.jsx'));

export const boutique = {
  module: 'ecommerce_boutique',
  pages: [
    { id: 'boutique', libelle: 'Boutique en ligne', icone: 'panier', groupe: 'Vente', ordre: 4, permission: 'ecommerce_boutique.lire', composant: Boutique },
  ],
  widgets: [],
};
