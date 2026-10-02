// Modèle de manifeste : copier dans src/modules/<module>/manifeste.js, puis ajouter l'import
// et l'entrée dans MANIFESTES (src/modules/index.js). Voir SOP 02, 06, 36, 37.
import PageExemple from './PageExemple.jsx';
import { IndicateurExemple } from './widgets.jsx';

export default {
  module: 'exemple', // = modules.id dans la base (statut beta ou actif)
  pages: [
    { id: 'exemple', libelle: 'Exemple', icone: 'modules', groupe: 'Relations', ordre: 30, permission: 'exemple.lire', composant: PageExemple },
  ],
  widgets: [
    { id: 'exemple.total', zone: 'indicateur', ordre: 70, permission: 'exemple.lire', composant: IndicateurExemple },
  ],
};
