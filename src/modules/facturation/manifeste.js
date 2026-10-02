import Factures from './Factures.jsx';
import { SyntheseFacturation } from './widgets.jsx';

export default {
  module: 'facturation',
  pages: [
    { id: 'factures', libelle: 'Devis et factures', icone: 'facture', groupe: 'Vente', ordre: 25, permission: 'facturation.lire', composant: Factures },
  ],
  widgets: [
    { id: 'facturation.synthese', zone: 'section', ordre: 40, permission: 'facturation.lire', composant: SyntheseFacturation },
  ],
};
