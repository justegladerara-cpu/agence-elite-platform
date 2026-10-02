import Depenses from './Depenses.jsx';
import { Resultat, TotalDepenses } from './widgets.jsx';

export default {
  module: 'depenses',
  pages: [
    { id: 'depenses', libelle: 'Dépenses', icone: 'depenses', groupe: 'Relations', ordre: 20, permission: 'depenses.lire', composant: Depenses },
  ],
  widgets: [
    { id: 'depenses.total', zone: 'indicateur', ordre: 30, permission: 'depenses.lire', composant: TotalDepenses },
    { id: 'depenses.resultat', zone: 'indicateur', ordre: 40, permission: 'depenses.lire', composant: Resultat },
  ],
};
