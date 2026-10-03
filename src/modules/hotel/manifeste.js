import Chambres from './Chambres.jsx';
import Reception from './Reception.jsx';

export const reservations = {
  module: 'hotel_reservations',
  pages: [
    { id: 'hotel', libelle: 'Réception', icone: 'cle', groupe: 'Vente', ordre: 2, permission: 'hotel_reservations.lire', composant: Reception },
  ],
  widgets: [],
};

export const chambres = {
  module: 'hotel_chambres',
  pages: [
    { id: 'chambres', libelle: 'Chambres', icone: 'lit', groupe: 'Vente', ordre: 3, permission: 'hotel_chambres.lire', composant: Chambres },
  ],
  widgets: [],
};
