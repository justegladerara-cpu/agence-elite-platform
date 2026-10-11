import { lazy } from 'react';

// Module Paiements : les paiements se saisissent en caisse et dans les ventes ; le rapprochement compare les relevés de
// banque ou de Mobile Money à ce qui a été enregistré. « Qui me doit ? » rassemble ce que les clients doivent encore.
const Rapprochement = lazy(() => import('./Rapprochement.jsx'));
const QuiMeDoit = lazy(() => import('./QuiMeDoit.jsx'));

export default {
  module: 'paiements',
  pages: [
    { id: 'qui-me-doit', libelle: 'Qui me doit ?', icone: 'clients', groupe: 'Vente', ordre: 22, permission: 'paiements.lire', composant: QuiMeDoit },
    { id: 'rapprochement', libelle: 'Rapprochement', icone: 'transfert', groupe: 'Pilotage', ordre: 40, permission: 'paiements.rapprocher', composant: Rapprochement },
  ],
  widgets: [],
};
