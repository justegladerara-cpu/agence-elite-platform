import Stock from './Stock.jsx';
import Transferts from './Transferts.jsx';
import { StockASurveiller, ValeurStock } from './widgets.jsx';

export default {
  module: 'stock',
  pages: [
    { id: 'stock', libelle: 'Stock', icone: 'stock', groupe: 'Catalogue et stock', ordre: 20, permission: 'stock.lire', composant: Stock },
    // Les Transferts n'existent pour l'utilisateur que s'il voit plusieurs Hubs.
    { id: 'transferts', libelle: 'Transferts', icone: 'transfert', groupe: 'Catalogue et stock', ordre: 30, permission: 'stock.lire', composant: Transferts, horsMenuSi: (e, espace) => !espace?.multiHub },
  ],
  widgets: [
    { id: 'stock.valeur', zone: 'indicateur', ordre: 60, permission: 'stock.lire', composant: ValeurStock },
    { id: 'stock.a_surveiller', zone: 'colonne', ordre: 20, permission: 'stock.lire', composant: StockASurveiller },
  ],
};
