import { lazy } from 'react';
// Module RH : trois modules en base (rh_employes, rh_presences, rh_conges), un dossier d'écrans.
// Chaque page déclare son module : elle n'apparaît que si ce module est actif et la permission accordée.
const Conges = lazy(() => import('./Conges.jsx'));
const Employes = lazy(() => import('./Employes.jsx'));
const MonEspace = lazy(() => import('./MonEspace.jsx'));
const Presences = lazy(() => import('./Presences.jsx'));

export default {
  module: 'rh_employes',
  pages: [
    { id: 'mon-espace', libelle: 'Mon espace', icone: 'utilisateur', groupe: 'Pilotage', ordre: 15, permission: 'rh_employes.espace', composant: MonEspace,
      horsMenuSi: (etablissement) => !etablissement?.employe_id },
    { id: 'employes', libelle: 'Employés', icone: 'organigramme', groupe: 'Ressources humaines', ordre: 10, permission: 'rh_employes.lire', composant: Employes },
    { id: 'presences', module: 'rh_presences', libelle: 'Présences', icone: 'horloge', groupe: 'Ressources humaines', ordre: 20, permission: 'rh_presences.lire', composant: Presences },
    { id: 'conges', module: 'rh_conges', libelle: 'Congés', icone: 'valise', groupe: 'Ressources humaines', ordre: 30, permission: 'rh_conges.lire', composant: Conges },
  ],
  widgets: [],
};
