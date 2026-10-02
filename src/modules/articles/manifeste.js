import Articles from './Articles.jsx';

export default {
  module: 'articles',
  pages: [
    { id: 'articles', libelle: 'Articles', icone: 'articles', groupe: 'Catalogue et stock', ordre: 10, permission: 'articles.lire', composant: Articles },
  ],
  widgets: [],
};
