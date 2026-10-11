import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Achats = lazy(() => import('./Achats.jsx'));
const AQuiJeDois = lazy(() => import('./AQuiJeDois.jsx'));

export default {
  module: 'achats',
  pages: [
    { id: 'achats', libelle: 'Achats', icone: 'panier', groupe: 'Catalogue et stock', ordre: 35, permission: 'achats.lire', composant: Achats },
    { id: 'a-qui-je-dois', libelle: 'À qui je dois ?', icone: 'echeance', groupe: 'Relations', ordre: 21, permission: 'achats.lire', composant: AQuiJeDois },
  ],
  widgets: [],
};
