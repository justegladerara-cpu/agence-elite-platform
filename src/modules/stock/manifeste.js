import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Stock = lazy(() => import('./Stock.jsx'));
const Transferts = lazy(() => import('./Transferts.jsx'));
const PreparerCommande = lazy(() => import('./PreparerCommande.jsx'));
const Emballages = lazy(() => import('./Emballages.jsx'));

export default {
  module: 'stock',
  pages: [
    { id: 'stock', libelle: 'Stock', icone: 'stock', groupe: 'Catalogue et stock', ordre: 20, permission: 'stock.lire', composant: Stock },
    // Emballages consignés : casiers et bouteilles vides (migration 20261017000136).
    { id: 'emballages', libelle: 'Emballages consignés', icone: 'depot', groupe: 'Catalogue et stock', ordre: 25, permission: ['stock.emballages', 'stock.lire'], composant: Emballages },
    // Les Transferts n'existent pour l'utilisateur que s'il voit plusieurs Hubs.
    // Commande fournisseur WhatsApp à partir des articles au minimum (migration 20261017000135, lot 3).
    { id: 'preparer-commande', libelle: 'Préparer la commande', icone: 'panier', groupe: 'Catalogue et stock', ordre: 26, permission: 'stock.lire', composant: PreparerCommande },
    { id: 'transferts', libelle: 'Transferts', icone: 'transfert', groupe: 'Catalogue et stock', ordre: 30, permission: 'stock.lire', composant: Transferts, horsMenuSi: (e, espace) => !espace?.multiHub },
  ],
  widgets: [],
};
