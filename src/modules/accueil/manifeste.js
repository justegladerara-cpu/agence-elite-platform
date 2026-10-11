import { lazy } from 'react';

const Accueil = lazy(() => import('./Accueil.jsx'));

// Accueil « Qu'est-ce que vous voulez faire ? » : premier écran du menu, donc écran ouvert à la connexion
// (sauf page d'accueil choisie dans le profil). Il appartient au socle « Tableau de bord ».
export default {
  module: 'tableau_de_bord',
  pages: [
    { id: 'accueil', libelle: 'Accueil', icone: 'fusee', groupe: 'Pilotage', ordre: 1, permission: 'tableau_de_bord.lire', composant: Accueil },
  ],
  widgets: [],
};
