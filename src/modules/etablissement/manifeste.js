// Socle « Établissement » : Hubs, mise en service, applications, paramètres.
import Hubs from '../hubs/Hubs.jsx';
import { ParHub } from '../hubs/widgets.jsx';
import Applications from './Applications.jsx';
import MiseEnService from './MiseEnService.jsx';
import Parametres from './Parametres.jsx';

export default {
  module: 'etablissement',
  pages: [
    // Un petit commerce à un seul Hub ne voit les Hubs que s'il peut en créer un.
    { id: 'hubs', libelle: 'Hubs', icone: 'hub', groupe: 'Organisation', ordre: 10, permission: 'etablissement.lire', composant: Hubs, horsMenuSi: (e, espace) => !espace?.multiHub && !espace?.peut('etablissement.gerer_hubs') },
    { id: 'mise-en-service', libelle: 'Mise en service', icone: 'fusee', groupe: 'Organisation', ordre: 30, permission: 'etablissement.modifier', composant: MiseEnService, horsMenuSi: (e) => Boolean(e.mis_en_service_le) },
    { id: 'applications', libelle: 'Applications', icone: 'modules', groupe: 'Organisation', ordre: 40, permission: 'etablissement.lire', composant: Applications },
    { id: 'parametres', libelle: 'Paramètres', icone: 'parametres', groupe: 'Organisation', ordre: 50, permission: 'etablissement.lire', composant: Parametres },
  ],
  widgets: [
    { id: 'etablissement.par_hub', zone: 'section', ordre: 10, visible: ({ espace, tdb }) => espace.multiHub && !espace.hub && tdb.par_hub?.length > 1, composant: ParHub },
  ],
};
