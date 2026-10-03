import Boutique from './Boutique.jsx';
import { SyntheseBoutique } from './widgets.jsx';

export const boutique = {
  module: 'ecommerce_boutique',
  pages: [
    { id: 'boutique', libelle: 'Boutique en ligne', icone: 'panier', groupe: 'Vente', ordre: 4, permission: 'ecommerce_boutique.lire', composant: Boutique },
  ],
  widgets: [
    { id: 'boutique.synthese', zone: 'section', ordre: 5, permission: 'ecommerce_boutique.lire', composant: SyntheseBoutique },
  ],
};
