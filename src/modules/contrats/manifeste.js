import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Contrats = lazy(() => import('./Contrats.jsx'));

export default {
  module: 'contrats',
  pages: [
    { id: 'contrats', libelle: 'Contrats', icone: 'document', groupe: 'Vente', ordre: 26, permission: 'contrats.lire', composant: Contrats },
  ],
  widgets: [],
};
