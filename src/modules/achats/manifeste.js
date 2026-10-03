import Achats from './Achats.jsx';

export default {
  module: 'achats',
  pages: [
    { id: 'achats', libelle: 'Achats', icone: 'panier', groupe: 'Catalogue et stock', ordre: 35, permission: 'achats.lire', composant: Achats },
  ],
  widgets: [],
};
