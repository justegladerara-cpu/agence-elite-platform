// Module Paiements : aucun écran propre (les paiements se saisissent en caisse et dans les ventes).
import { Encaisse } from './widgets.jsx';

export default {
  module: 'paiements',
  pages: [],
  widgets: [
    { id: 'paiements.encaisse', zone: 'indicateur', ordre: 20, composant: Encaisse },
  ],
};
