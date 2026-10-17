import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Caisse = lazy(() => import('./Caisse.jsx'));
const MenuQr = lazy(() => import('./MenuQr.jsx'));
const CommandesQr = lazy(() => import('./CommandesQr.jsx'));
const QrCodes = lazy(() => import('./QrCodes.jsx'));

export default {
  module: 'caisse',
  pages: [
    { id: 'caisse', libelle: 'Caisse', icone: 'caisse', groupe: 'Vente', ordre: 10, permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
    // Menu en ligne et QR codes des tables (migration 20261012000131) : réglé par le gérant.
    { id: 'menu-qr', libelle: 'Menu QR des tables', icone: 'table', groupe: 'Vente', ordre: 12, permission: 'caisse.menu_qr', composant: MenuQr },
    // QR codes libres (lien, WhatsApp, menu, Wi-Fi), logo au centre et scans comptés (migration 20261017000139).
    { id: 'qr-codes', libelle: 'QR codes', icone: 'cible', groupe: 'Vente', ordre: 12.5, permission: 'caisse.menu_qr', composant: QrCodes },
    // Commandes envoyées depuis les tables : ouvertes depuis la caisse, la notification ou le menu QR.
    { id: 'commandes-qr', libelle: 'Commandes des tables', icone: 'table', groupe: 'Vente', ordre: 13, permission: 'caisse.utiliser', composant: CommandesQr, horsMenuSi: () => true },
  ],
  widgets: [],
};
