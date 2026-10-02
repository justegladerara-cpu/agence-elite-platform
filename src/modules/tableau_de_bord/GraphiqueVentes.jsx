import React from 'react';

export function compact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString('fr-FR')} k`;
  return Math.round(n).toLocaleString('fr-FR');
}

export default function GraphiqueVentes({ series, montant }) {
  const max = Math.max(...series.map((s) => s.total), 1);
  const largeur = 640;
  const hauteur = 200;
  const marge = { haut: 12, bas: 26, gauche: 44, droite: 8 };
  const zoneL = largeur - marge.gauche - marge.droite;
  const zoneH = hauteur - marge.haut - marge.bas;
  const pas = zoneL / series.length;
  const barre = Math.max(Math.min(pas - 4, 36), 3);
  const graduations = [0, max / 2, max];
  const etiquetteTous = Math.ceil(series.length / 8);
  return (
    <svg className="graphique" viewBox={`0 0 ${largeur} ${hauteur}`} role="img" aria-label="Ventes par jour">
      {graduations.map((g) => {
        const y = marge.haut + zoneH - (g / max) * zoneH;
        return (
          <g key={g}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y} y2={y} className="graphique-grille" />
            <text x={marge.gauche - 6} y={y + 4} textAnchor="end" className="graphique-texte">{compact(g)}</text>
          </g>
        );
      })}
      {series.map((s, i) => {
        const h = (s.total / max) * zoneH;
        const x = marge.gauche + i * pas + (pas - barre) / 2;
        return (
          <g key={s.jour}>
            <rect x={x} y={marge.haut + zoneH - h} width={barre} height={Math.max(h, s.total > 0 ? 2 : 0)} rx="3" className="graphique-barre">
              <title>{`${new Date(`${s.jour}T12:00:00`).toLocaleDateString('fr-FR')} : ${montant(s.total)} (${s.nombre} vente(s))`}</title>
            </rect>
            {i % etiquetteTous === 0 && (
              <text x={x + barre / 2} y={hauteur - 8} textAnchor="middle" className="graphique-texte">
                {new Date(`${s.jour}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
