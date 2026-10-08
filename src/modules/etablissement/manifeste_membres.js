import { lazy } from 'react';
// Socle « Membres » : l'équipe et ses droits.
const Equipe = lazy(() => import('./Equipe.jsx'));

export default {
  module: 'membres',
  pages: [
    { id: 'equipe', libelle: 'Équipe', icone: 'membres', groupe: 'Organisation', ordre: 20, permission: 'membres.lire', composant: Equipe },
  ],
  widgets: [],
};
