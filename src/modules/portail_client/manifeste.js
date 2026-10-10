import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const EspaceClient = lazy(() => import('./EspaceClient.jsx'));

export default {
  module: 'portail_client',
  pages: [
    { id: 'espace-client', libelle: 'Espace client', icone: 'globe', groupe: 'Relations', ordre: 13, permission: 'portail_client.lire', composant: EspaceClient },
  ],
  widgets: [],
};
