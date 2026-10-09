import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Production = lazy(() => import('./Production.jsx'));

export default {
  module: 'production',
  pages: [
    { id: 'production', libelle: 'Production', icone: 'inventaire', groupe: 'Catalogue et stock', ordre: 45, permission: 'production.lire', composant: Production },
  ],
  widgets: [],
};
