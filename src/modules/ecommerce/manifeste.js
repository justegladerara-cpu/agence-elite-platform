import Boutique from './Boutique.jsx';

export const boutique = {
  module: 'ecommerce_boutique',
  pages: [
    { id: 'boutique', libelle: 'Boutique en ligne', icone: 'panier', groupe: 'Vente', ordre: 4, permission: 'ecommerce_boutique.lire', composant: Boutique },
  ],
  widgets: [],
};
