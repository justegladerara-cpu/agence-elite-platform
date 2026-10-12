import React, { useEffect, useRef, useState } from 'react';

// Animations des chiffres (tableaux de bord, cartes d'indicateurs). Le style des animations
// (apparition des pages, cartes, barres) est dans styles.css, section « Mouvement ».
// Tout s'arrête si l'appareil demande moins d'animations (prefers-reduced-motion) ou si
// le navigateur ne sait pas les jouer (tests).

export function mouvementReduit() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || typeof window.requestAnimationFrame !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const NOMBRE = /\d[\d\s  ]*(?:,\d+)?/;

// Repère le premier nombre d'un texte déjà formaté (« 12 500 FCFA », « 87 % », « 3,5 h »).
export function lireNombre(texte) {
  if (typeof texte !== 'string' && typeof texte !== 'number') return null;
  const s = String(texte);
  const m = s.match(NOMBRE);
  if (!m) return null;
  const brut = m[0].trimEnd();
  const decimales = brut.includes(',') ? brut.split(',')[1].length : 0;
  const valeur = Number(brut.replace(/[\s  ]/g, '').replace(',', '.'));
  if (!Number.isFinite(valeur)) return null;
  return { valeur, decimales, avant: s.slice(0, m.index), apres: s.slice(m.index + brut.length) };
}

const format = (n, decimales) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n).replace(/[  ]/g, ' ');

// Texte intermédiaire pendant l'animation (progression de 0 à 1).
export function texteIntermediaire(nombre, progression) {
  if (progression >= 1) return null;
  return `${nombre.avant}${format(nombre.valeur * progression, nombre.decimales)}${nombre.apres}`;
}

const adoucir = (t) => 1 - Math.pow(1 - t, 3);

// Affiche « valeur » en faisant monter le nombre qu'elle contient. Le texte final est
// toujours exactement celui reçu ; seule l'animation passe par des valeurs intermédiaires.
export function ChiffreAnime({ valeur, duree = 900 }) {
  const nombre = lireNombre(valeur);
  const [intermediaire, setIntermediaire] = useState(() => (nombre && nombre.valeur !== 0 && !mouvementReduit() ? texteIntermediaire(nombre, 0) : null));
  const precedent = useRef(null);
  useEffect(() => {
    const n = lireNombre(valeur);
    if (!n || n.valeur === 0 || mouvementReduit() || precedent.current === String(valeur)) { setIntermediaire(null); precedent.current = String(valeur); return undefined; }
    precedent.current = String(valeur);
    let image;
    const debut = performance.now();
    const pas = (maintenant) => {
      const t = Math.min(1, (maintenant - debut) / duree);
      setIntermediaire(texteIntermediaire(n, adoucir(t)));
      if (t < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur, duree]);
  if (typeof valeur !== 'string' && typeof valeur !== 'number') return valeur ?? null;
  return (
    <>
      <span aria-hidden={intermediaire != null ? 'true' : undefined}>{intermediaire ?? valeur}</span>
      {intermediaire != null && <span className="sr-only">{valeur}</span>}
    </>
  );
}
