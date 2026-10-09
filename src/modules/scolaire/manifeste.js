import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Scolaire = lazy(() => import('./Scolaire.jsx'));

export default {
  module: 'scolaire',
  pages: [
    { id: 'scolaire', libelle: 'Scolarité', icone: 'membres', groupe: 'Relations', ordre: 40, permission: 'scolaire.lire', composant: Scolaire },
  ],
  widgets: [],
};
