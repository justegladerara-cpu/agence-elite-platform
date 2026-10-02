import Achats from './Achats.jsx';
import { SyntheseAchats } from './widgets.jsx';

export default {
  module: 'achats',
  pages: [
    { id: 'achats', libelle: 'Achats', icone: 'panier', groupe: 'Catalogue et stock', ordre: 35, permission: 'achats.lire', composant: Achats },
  ],
  widgets: [
    { id: 'achats.synthese', zone: 'section', ordre: 45, permission: 'achats.lire', composant: SyntheseAchats },
  ],
};
