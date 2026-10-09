import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Articles = lazy(() => import('./Articles.jsx'));

export default {
  module: 'articles',
  pages: [
    { id: 'articles', libelle: 'Articles', icone: 'articles', groupe: 'Catalogue et stock', ordre: 10, permission: 'articles.lire', composant: Articles },
  ],
  widgets: [],
};
