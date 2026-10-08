import { lazy } from 'react';
const Articles = lazy(() => import('./Articles.jsx'));

export default {
  module: 'articles',
  pages: [
    { id: 'articles', libelle: 'Articles', icone: 'articles', groupe: 'Catalogue et stock', ordre: 10, permission: 'articles.lire', composant: Articles },
  ],
  widgets: [],
};
