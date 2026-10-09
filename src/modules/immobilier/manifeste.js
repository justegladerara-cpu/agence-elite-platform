import Biens from './Biens.jsx';
import Locations from './Locations.jsx';
import Maintenance from './Maintenance.jsx';

// Gestion immobilière (agences, gestion locative pour compte de propriétaires) : trois modules, un groupe de menu.
export const biens = {
  module: 'immo_biens',
  pages: [
    { id: 'biens', libelle: 'Biens', icone: 'depot', groupe: 'Immobilier', ordre: 2, permission: 'immo_biens.lire', composant: Biens },
  ],
  widgets: [],
};

export const locations = {
  module: 'immo_locations',
  pages: [
    { id: 'locations', libelle: 'Locations', icone: 'cle', groupe: 'Immobilier', ordre: 1, permission: 'immo_locations.lire', composant: Locations },
  ],
  widgets: [],
};

export const maintenance = {
  module: 'immo_maintenance',
  pages: [
    { id: 'maintenance', libelle: 'Maintenance', icone: 'alerte', groupe: 'Immobilier', ordre: 3, permission: 'immo_maintenance.lire', composant: Maintenance },
  ],
  widgets: [],
};
