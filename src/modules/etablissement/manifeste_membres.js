// Socle « Membres » : l'équipe et ses droits.
import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Equipe = lazy(() => import('./Equipe.jsx'));

export default {
  module: 'membres',
  pages: [
    { id: 'equipe', libelle: 'Équipe', icone: 'membres', groupe: 'Organisation', ordre: 20, permission: 'membres.lire', composant: Equipe },
  ],
  widgets: [],
};
