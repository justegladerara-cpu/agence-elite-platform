import Rapports from './Rapports.jsx';

export default {
  module: 'rapports',
  pages: [
    { id: 'rapports', libelle: 'Rapports', icone: 'graphique', groupe: 'Pilotage', ordre: 20, permission: 'rapports.lire', composant: Rapports },
  ],
  widgets: [],
};
