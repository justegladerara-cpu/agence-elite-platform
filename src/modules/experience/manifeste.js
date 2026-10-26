import { lazy } from 'react';

// Nouvelle version (The Dream, 2026-10-25) : écrans montrés seulement aux établissements où le réglage
// « nouvelle_version » est allumé (Paramètres de l'établissement). Partout ailleurs, rien ne change.
const CentreCommande = lazy(() => import('./CentreCommande.jsx'));
const CentreVentes = lazy(() => import('./CentreVentes.jsx'));
const Articles = lazy(() => import('./Articles.jsx'));
const Stock = lazy(() => import('./Stock.jsx'));
const Equipe = lazy(() => import('./Equipe.jsx'));
const MesEspaces = lazy(() => import('./MesEspaces.jsx'));
const Reglages = lazy(() => import('./Reglages.jsx'));
const QrAvis = lazy(() => import('./QrAvis.jsx'));

const nouvelle = (espace) => espace.nouvelleVersion === true;

// Anciens écrans fusionnés dans les nouveaux : ils quittent le menu (leur adresse marche encore pour les anciens liens).
// « En attente de paiement » vit dans la caisse (bouton « À encaisser ») ; les comptes de l'équipe dans « Équipe » ;
// les applications dans « Paramètres ».
export const PAGES_REMPLACEES = [
  'accueil', 'tableau-de-bord', 'ventes', 'z-et-rapports', 'articles', 'stock', 'hubs', 'parametres', 'qr-codes',
  'qui-me-doit', 'equipe', 'applications',
];

export default {
  module: 'tableau_de_bord',
  pages: [
    { id: 'centre', libelle: 'Tableau de bord', libelleCourt: 'Tableau', icone: 'tableau', groupe: 'Pilotage', ordre: 0.5, permission: 'cloture.cloturer', module: 'cloture', composant: CentreCommande, seulementSi: nouvelle },
    { id: 'centre-ventes', libelle: 'Centre des ventes', libelleCourt: 'Ventes', icone: 'ventes', groupe: 'Vente', ordre: 19, permission: 'ventes.lire', module: 'ventes', composant: CentreVentes, seulementSi: nouvelle },
    { id: 'qr-et-avis', libelle: 'QR et avis', icone: 'qr', groupe: 'Vente', ordre: 12.4, permission: ['caisse.menu_qr', 'cloture.cloturer'], module: 'caisse', composant: QrAvis, seulementSi: nouvelle },
    { id: 'mes-articles', libelle: 'Articles', icone: 'articles', groupe: 'Catalogue et stock', ordre: 9, permission: 'articles.lire', module: 'articles', composant: Articles, seulementSi: nouvelle },
    { id: 'mon-stock', libelle: 'Stock', icone: 'inventaire', groupe: 'Catalogue et stock', ordre: 19, permission: 'stock.lire', module: 'stock', composant: Stock, seulementSi: nouvelle },
    { id: 'mon-equipe', libelle: 'Équipe', icone: 'badge', groupe: 'Organisation', ordre: 19, permission: ['cloture.cloturer', 'membres.lire'], module: 'etablissement', composant: Equipe, seulementSi: nouvelle },
    { id: 'mes-espaces', libelle: 'Mes espaces', icone: 'depot', groupe: 'Organisation', ordre: 9, permission: 'etablissement.lire', module: 'etablissement', composant: MesEspaces, seulementSi: nouvelle },
    { id: 'reglages', libelle: 'Paramètres', icone: 'parametres', groupe: 'Organisation', ordre: 49, permission: 'etablissement.lire', module: 'etablissement', composant: Reglages, seulementSi: nouvelle },
  ],
  widgets: [],
};
