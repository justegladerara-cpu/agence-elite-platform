import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Factures = lazy(() => import('./Factures.jsx'));

export default {
  module: 'facturation',
  pages: [
    { id: 'factures', libelle: 'Devis et factures', icone: 'facture', groupe: 'Vente', ordre: 25, permission: 'facturation.lire', composant: Factures },
  ],
  widgets: [],
};
