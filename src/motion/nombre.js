// Compteur animé (EMS) : quand un chiffre clé CHANGE, il glisse de l'ancienne valeur vers la nouvelle.
// Règles (docs/motion/MOTION_COMPONENTS.md) :
// - premier affichage : la valeur exacte, jamais un comptage depuis 0 (ce serait un chiffre faux à l'écran) ;
// - la dernière image affiche toujours exactement la valeur reçue (pas une valeur recalculée) ;
// - aucune animation si le niveau est « léger » ou « réduit », si l'onglet est caché ou si la valeur n'est pas un nombre ;
// - jamais dans la caisse : total, monnaie et reste dû s'affichent instantanément.
import { useLayoutEffect, useRef, useState } from 'react';
import { niveauCourant } from './preferences.js';

export const DUREES_NOMBRE = { complet: 520, equilibre: 380, leger: 0, reduit: 0 };

export const sortieCubique = (t) => 1 - (1 - t) ** 3;

export function decimalesDe(...valeurs) {
  return Math.min(2, Math.max(0, ...valeurs.map((v) => {
    const texte = String(v);
    return texte.includes('.') ? texte.split('.')[1].length : 0;
  })));
}

// Valeur intermédiaire arrondie au même nombre de décimales que les valeurs réelles (FCFA : entier).
// progression ≥ 1 : la valeur d'arrivée elle-même, sans calcul.
export function interpoler(depart, arrivee, progression, decimales = decimalesDe(depart, arrivee)) {
  if (progression >= 1) return arrivee;
  if (progression <= 0) return depart;
  const facteur = 10 ** decimales;
  return Math.round((depart + (arrivee - depart) * progression) * facteur) / facteur;
}

function animable(depart, arrivee) {
  return Number.isFinite(depart) && Number.isFinite(arrivee) && depart !== arrivee;
}

// Renvoie [valeur à afficher, animation en cours]. La valeur affichée vaut `valeur` dès que rien ne bouge.
export function useNombreAnime(valeur, { duree } = {}) {
  const [intermediaire, setIntermediaire] = useState(null);
  const precedente = useRef(valeur);
  useLayoutEffect(() => {
    const depart = Number(intermediaire ?? precedente.current);
    precedente.current = valeur;
    const arrivee = Number(valeur);
    const d = duree ?? DUREES_NOMBRE[niveauCourant()] ?? 0;
    const cache = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!d || cache || valeur == null || !animable(depart, arrivee) || typeof requestAnimationFrame !== 'function') {
      setIntermediaire(null);
      return undefined;
    }
    const decimales = decimalesDe(depart, arrivee);
    let debut = null;
    let image = null;
    setIntermediaire(depart);
    const pas = (t) => {
      if (debut == null) debut = t;
      const p = Math.min(1, (t - debut) / d);
      if (p >= 1) {
        setIntermediaire(null);
        return;
      }
      const v = interpoler(depart, arrivee, sortieCubique(p), decimales);
      setIntermediaire(v);
      image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => {
      if (image != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(image);
    };
    // Seul un changement de valeur relance l'animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur, duree]);
  return intermediaire == null ? [valeur, false] : [intermediaire, true];
}
