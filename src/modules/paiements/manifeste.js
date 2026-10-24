import { lazy } from 'react';

// Module Paiements : les paiements se saisissent en caisse et dans les ventes. « Qui me doit ? » rassemble ce que les
// clients doivent encore. Le rapprochement des relevés a été retiré du menu (2026-10-13, demande de Juste : « ça ne sert
// à rien ») ; ses données et ses fonctions en base restent intactes.
const QuiMeDoit = lazy(() => import('./QuiMeDoit.jsx'));

export default {
  module: 'paiements',
  pages: [
    { id: 'qui-me-doit', libelle: 'En attente de paiement', icone: 'clients', groupe: 'Vente', ordre: 22, permission: 'paiements.lire', composant: QuiMeDoit },
  ],
  widgets: [],
};
