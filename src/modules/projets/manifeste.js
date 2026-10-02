import Projets from './Projets.jsx';
import { SyntheseProjets } from './widgets.jsx';

export default {
  module: 'projets',
  pages: [
    { id: 'projets', libelle: 'Projets', icone: 'dossier', groupe: 'Organisation', ordre: 5, permission: 'projets.lire', composant: Projets },
  ],
  widgets: [
    { id: 'projets.synthese', zone: 'section', ordre: 50, permission: 'projets.lire', composant: SyntheseProjets },
  ],
};
