import { lazy } from 'react';

// Écrans chargés à la demande : l'application démarre plus vite (moins de code au premier affichage).
const Caisse = lazy(() => import('./Caisse.jsx'));
const MenuQr = lazy(() => import('./MenuQr.jsx'));
const CommandesQr = lazy(() => import('./CommandesQr.jsx'));
const HappyHour = lazy(() => import('./HappyHour.jsx'));
const OffertsPertes = lazy(() => import('./OffertsPertes.jsx'));
const Reserves = lazy(() => import('./Reserves.jsx'));
const QrCodes = lazy(() => import('./QrCodes.jsx'));
const PrendreCommande = lazy(() => import('./PrendreCommande.jsx'));

export default {
  module: 'caisse',
  pages: [
    { id: 'caisse', libelle: 'Caisse', icone: 'caisse', groupe: 'Vente', ordre: 10, permission: 'caisse.utiliser', composant: Caisse, pleinEcran: true },
    // Tablette du serveur (migration 20261023000158) : il prend la commande, la caisse ouverte la reçoit.
    { id: 'prendre-commande', libelle: 'Prendre une commande', icone: 'panier', groupe: 'Vente', ordre: 11, permission: 'caisse.commander', composant: PrendreCommande },
    // Menu en ligne et QR codes des tables (migration 20261012000131) : réglé par le gérant.
    // Menu QR, Happy hour et Bouteilles en réserve : éteints par défaut depuis le 2026-10-23 (src/noyau/fonctions.js),
    // rallumables dans Paramètres > Applications. Juste utilise « QR codes », imprimés sur les tables.
    { id: 'menu-qr', libelle: 'Menu QR des tables', icone: 'table', groupe: 'Vente', ordre: 12, permission: 'caisse.menu_qr', composant: MenuQr },
    // QR codes libres (lien, WhatsApp, menu, Wi-Fi), logo au centre et scans comptés (migration 20261017000139).
    { id: 'qr-codes', libelle: 'QR codes', icone: 'cible', groupe: 'Vente', ordre: 12.5, permission: 'caisse.menu_qr', composant: QrCodes },
    // Commandes envoyées depuis les tables : ouvertes depuis la caisse, la notification ou le menu QR.
    { id: 'commandes-qr', libelle: 'Commandes des tables', icone: 'table', groupe: 'Vente', ordre: 13, permission: 'caisse.utiliser', composant: CommandesQr, horsMenuSi: () => true },
    // Lot 3 bars et restaurants (migration 20261017000135) : prix par horaire et rapport des offerts, pertes, pourboires.
    { id: 'happy-hour', libelle: 'Happy hour', icone: 'horloge', groupe: 'Vente', ordre: 14, permission: 'caisse.happy_hour', composant: HappyHour },
    { id: 'offerts-pertes', libelle: 'Offerts et pertes', icone: 'etoile', groupe: 'Vente', ordre: 15, permission: 'caisse.offerts_pertes', composant: OffertsPertes },
    // Bouteilles en réserve au nom d'un client (migration 20261017000136).
    { id: 'reserves', libelle: 'Bouteilles en réserve', icone: 'etoile', groupe: 'Vente', ordre: 16, permission: 'caisse.reserve', composant: Reserves },
  ],
  widgets: [],
};
