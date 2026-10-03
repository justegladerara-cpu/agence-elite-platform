import Factures from './Factures.jsx';

export default {
  module: 'facturation',
  pages: [
    { id: 'factures', libelle: 'Devis et factures', icone: 'facture', groupe: 'Vente', ordre: 25, permission: 'facturation.lire', composant: Factures },
  ],
  widgets: [],
};
