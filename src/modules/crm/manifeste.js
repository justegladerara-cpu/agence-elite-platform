import Crm from './Crm.jsx';
import { SyntheseCrm } from './widgets.jsx';

export default {
  module: 'crm_pipeline',
  pages: [
    { id: 'crm', libelle: 'Prospects et opportunités', icone: 'cible', groupe: 'Relations', ordre: 5, permission: 'crm_pipeline.lire', composant: Crm },
  ],
  widgets: [
    { id: 'crm.synthese', zone: 'section', ordre: 35, permission: 'crm_pipeline.lire', composant: SyntheseCrm },
  ],
};
