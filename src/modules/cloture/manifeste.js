import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Clotures = lazy(() => import('./Clotures.jsx'));
const ActiviteCaissiers = lazy(() => import('./ActiviteCaissiers.jsx'));
const ServeursCaisse = lazy(() => import('./ServeursCaisse.jsx'));
const RapportDuSoir = lazy(() => import('./RapportDuSoir.jsx'));

export default {
  module: 'cloture',
  pages: [
    { id: 'clotures', libelle: 'Ticket Z', icone: 'cloture', groupe: 'Vente', ordre: 30, permission: ['cloture.lire', 'caisse.utiliser'], composant: Clotures },
    // Résumé de la journée à envoyer au patron sur WhatsApp : gérant, responsable, ou qui lit les rapports.
    { id: 'rapport-du-soir', libelle: 'Rapport du soir', icone: 'message', groupe: 'Pilotage', ordre: 15, permission: ['cloture.cloturer', 'rapports.lire'], composant: RapportDuSoir },
  ],
  widgets: [
    // Qui tient une caisse maintenant, montant par personne et classement : réservé aux responsables.
    { id: 'activite-caissiers', zone: 'section', ordre: 20, permission: 'cloture.cloturer', composant: ActiviteCaissiers },
    // Ventes par serveur (choisi à la caisse) et gestion de la liste : réservé aux responsables.
    { id: 'serveurs-caisse', zone: 'section', ordre: 21, permission: 'cloture.cloturer', composant: ServeursCaisse },
  ],
};
