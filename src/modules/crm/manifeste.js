import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Crm = lazy(() => import('./Crm.jsx'));

export default {
  module: 'crm_pipeline',
  pages: [
    { id: 'crm', libelle: 'Prospects et opportunités', icone: 'cible', groupe: 'Relations', ordre: 5, permission: 'crm_pipeline.lire', composant: Crm },
  ],
  widgets: [],
};
