import { lazy } from 'react';
const Crm = lazy(() => import('./Crm.jsx'));

export default {
  module: 'crm_pipeline',
  pages: [
    { id: 'crm', libelle: 'Prospects et opportunités', icone: 'cible', groupe: 'Relations', ordre: 5, permission: 'crm_pipeline.lire', composant: Crm },
  ],
  widgets: [],
};
