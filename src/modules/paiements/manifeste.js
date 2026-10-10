import { lazy } from 'react';

// Module Paiements : les paiements se saisissent en caisse et dans les ventes ; le rapprochement compare les relevés de
// banque ou de Mobile Money à ce qui a été enregistré.
const Rapprochement = lazy(() => import('./Rapprochement.jsx'));

export default {
  module: 'paiements',
  pages: [
    { id: 'rapprochement', libelle: 'Rapprochement', icone: 'transfert', groupe: 'Pilotage', ordre: 40, permission: 'paiements.rapprocher', composant: Rapprochement },
  ],
  widgets: [],
};
