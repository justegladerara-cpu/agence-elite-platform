import React from 'react';

// Bandeau « Nouveau » : signale une nouveauté pendant 72 h puis disparaît tout seul (demande de Juste, 2026-10-11 :
// « partout où il y a les nouvelles fonctionnalités, mets un bandeau qui mentionne nouveau pendant 72 h »).
// Pour une prochaine nouveauté : passer sa propre date de fin dans « jusqua ».
export const NOUVEAUTES_CAISSE_JUSQUA = '2026-10-14T22:30:00Z';
// Pop-ups « Tu continues ? » et « Tu es toujours là ? » (2026-10-12).
export const NOUVEAU_PRESENCE_JUSQUA = '2026-10-15T12:00:00Z';
// Caisse unique, serveurs, bouton Encaisser toujours visible sur tablette, alerte ticket Z (2026-10-13).
export const NOUVEAU_CAISSE_UNIQUE_JUSQUA = '2026-10-18T12:00:00Z';
// Lot 3 bars et restaurants : happy hour, offerts, pourboires, alerte de stock, commande WhatsApp (2026-10-13).
export const NOUVEAU_LOT3_JUSQUA = '2026-10-16T12:00:00Z';
// Caisse sans internet : ventes gardées sur l'appareil, envoyées au retour de la connexion (2026-10-13).
export const NOUVEAU_HORS_LIGNE_JUSQUA = '2026-10-16T12:00:00Z';
// QR codes avec logo, QR codes libres (lien, WhatsApp, menu, Wi-Fi) et suivi des scans (2026-10-17).
export const NOUVEAU_QR_JUSQUA = '2026-10-21T12:00:00Z';

export const estNouveau = (jusqua = NOUVEAUTES_CAISSE_JUSQUA, maintenant = Date.now()) => maintenant < new Date(jusqua).getTime();

export function BandeauNouveau({ children, jusqua = NOUVEAUTES_CAISSE_JUSQUA }) {
  if (!estNouveau(jusqua)) return null;
  return (
    <p className="bandeau-nouveau" role="note">
      <span className="pastille-nouveau">Nouveau</span>
      <span>{children}</span>
    </p>
  );
}

export function PastilleNouveau({ jusqua = NOUVEAUTES_CAISSE_JUSQUA }) {
  if (!estNouveau(jusqua)) return null;
  return <span className="pastille-nouveau">Nouveau</span>;
}
