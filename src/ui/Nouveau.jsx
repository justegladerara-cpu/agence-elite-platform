import React from 'react';

// Bandeau « Nouveau » : signale une nouveauté pendant 72 h puis disparaît tout seul (demande de Juste, 2026-10-11 :
// « partout où il y a les nouvelles fonctionnalités, mets un bandeau qui mentionne nouveau pendant 72 h »).
// Pour une prochaine nouveauté : passer sa propre date de fin dans « jusqua ».
export const NOUVEAUTES_CAISSE_JUSQUA = '2026-10-14T22:30:00Z';
// Pop-ups « Tu continues ? » et « Tu es toujours là ? » (2026-10-12).
export const NOUVEAU_PRESENCE_JUSQUA = '2026-10-15T12:00:00Z';
// Caisse unique, serveurs, bouton Encaisser toujours visible sur tablette, alerte ticket Z (2026-10-13).
export const NOUVEAU_CAISSE_UNIQUE_JUSQUA = '2026-10-18T12:00:00Z';

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
