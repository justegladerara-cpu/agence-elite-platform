import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Clotures = lazy(() => import('./Clotures.jsx'));
const ActiviteCaissiers = lazy(() => import('./ActiviteCaissiers.jsx'));

export default {
  module: 'cloture',
  pages: [
    { id: 'clotures', libelle: 'Clôtures', icone: 'cloture', groupe: 'Vente', ordre: 30, permission: ['cloture.lire', 'caisse.utiliser'], composant: Clotures },
  ],
  widgets: [
    // Qui tient une caisse maintenant, montant par personne et classement : réservé aux responsables.
    { id: 'activite-caissiers', zone: 'section', ordre: 20, permission: 'cloture.cloturer', composant: ActiviteCaissiers },
  ],
};
