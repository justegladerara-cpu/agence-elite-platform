import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Documents = lazy(() => import('./Documents.jsx'));

export default {
  module: 'documents',
  pages: [
    { id: 'documents', libelle: 'Documents', icone: 'dossier', groupe: 'Organisation', ordre: 30, permission: 'documents.lire', composant: Documents },
  ],
  widgets: [],
};
