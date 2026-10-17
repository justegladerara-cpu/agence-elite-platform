import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Caisse = lazy(() => import('./Caisse.jsx'));
const MenuQr = lazy(() => import('./MenuQr.jsx'));
const CommandesQr = lazy(() => import('./CommandesQr.jsx'));
const HappyHour = lazy(() => import('./HappyHour.jsx'));
const OffertsPertes = lazy(() => import('./OffertsPertes.jsx'));

export default {
  module: 'caisse',
  pages: [
    { id: 'caisse', libelle: 'Caisse', icone: 'caisse', groupe: 'Vente', ordre: 10, permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
    // Menu en ligne et QR codes des tables (migration 20261012000131) : réglé par le gérant.
    { id: 'menu-qr', libelle: 'Menu QR des tables', icone: 'table', groupe: 'Vente', ordre: 12, permission: 'caisse.menu_qr', composant: MenuQr },
    // Commandes envoyées depuis les tables : ouvertes depuis la caisse, la notification ou le menu QR.
    { id: 'commandes-qr', libelle: 'Commandes des tables', icone: 'table', groupe: 'Vente', ordre: 13, permission: 'caisse.utiliser', composant: CommandesQr, horsMenuSi: () => true },
    // Lot 3 bars et restaurants (migration 20261017000135) : prix par horaire et rapport des offerts, pertes, pourboires.
    { id: 'happy-hour', libelle: 'Happy hour', icone: 'horloge', groupe: 'Vente', ordre: 14, permission: 'caisse.happy_hour', composant: HappyHour },
    { id: 'offerts-pertes', libelle: 'Offerts et pertes', icone: 'etoile', groupe: 'Vente', ordre: 15, permission: 'caisse.offerts_pertes', composant: OffertsPertes },
  ],
  widgets: [],
};
