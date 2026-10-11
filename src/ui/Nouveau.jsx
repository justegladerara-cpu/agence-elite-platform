import React from 'react';

// Bandeau « Nouveau » : signale une nouveauté pendant 72 h puis disparaît tout seul (demande de Juste, 2026-10-11 :
// « partout où il y a les nouvelles fonctionnalités, mets un bandeau qui mentionne nouveau pendant 72 h »).
// Pour une prochaine nouveauté : passer sa propre date de fin dans « jusqua ».
export const NOUVEAUTES_CAISSE_JUSQUA = '2026-10-14T22:30:00Z';

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
