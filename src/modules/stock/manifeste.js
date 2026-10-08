import { lazy } from 'react';
const Stock = lazy(() => import('./Stock.jsx'));
const Transferts = lazy(() => import('./Transferts.jsx'));

export default {
  module: 'stock',
  pages: [
    { id: 'stock', libelle: 'Stock', icone: 'stock', groupe: 'Catalogue et stock', ordre: 20, permission: 'stock.lire', composant: Stock },
    // Les Transferts n'existent pour l'utilisateur que s'il voit plusieurs Hubs.
    { id: 'transferts', libelle: 'Transferts', icone: 'transfert', groupe: 'Catalogue et stock', ordre: 30, permission: 'stock.lire', composant: Transferts, horsMenuSi: (e, espace) => !espace?.multiHub },
  ],
  widgets: [],
};
