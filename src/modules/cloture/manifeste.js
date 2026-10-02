import Clotures from './Clotures.jsx';

export default {
  module: 'cloture',
  pages: [
    { id: 'clotures', libelle: 'Clôtures', icone: 'cloture', groupe: 'Vente', ordre: 30, permission: 'cloture.lire', composant: Clotures },
  ],
  widgets: [],
};
