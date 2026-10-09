import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Salle = lazy(() => import('./Salle.jsx'));
const Cuisine = lazy(() => import('./Cuisine.jsx'));

export const salle = {
  module: 'restaurant_salle',
  pages: [
    { id: 'salle', libelle: 'Salle', icone: 'table', groupe: 'Vente', ordre: 0, permission: 'restaurant_salle.lire', composant: Salle },
  ],
  widgets: [],
};

export const cuisine = {
  module: 'restaurant_cuisine',
  pages: [
    { id: 'cuisine', libelle: 'Écran cuisine', icone: 'cuisine', groupe: 'Vente', ordre: 1, permission: 'restaurant_cuisine.lire', composant: Cuisine },
  ],
  widgets: [],
};
