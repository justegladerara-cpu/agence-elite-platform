// Lignes nouvelles d'une liste (EMS) : une ligne qui apparaît après le premier affichage (ajout, retour d'un
// enregistrement) reçoit un bref surlignage. Rien au premier chargement, rien quand on change de page ou de tri
// (les lignes existaient déjà), rien si beaucoup de lignes arrivent d'un coup (rechargement complet).
import { useRef } from 'react';
import { niveauCourant } from './preferences.js';

export const DUREE_SURLIGNAGE_MS = 1600;
const MAX_NOUVELLES = 5;

// Fonction pure (testée) : clés présentes dans `lignes` et absentes de `connues`.
export function clesNouvelles(lignes, connues, cle = 'id', max = MAX_NOUVELLES) {
  if (!Array.isArray(lignes) || !connues) return [];
  const nouvelles = lignes.map((l) => l?.[cle]).filter((c) => c != null && !connues.has(c));
  return nouvelles.length <= max ? nouvelles : [];
}

// Suivi pendant le rendu, au changement de référence de `lignes` seulement (motif « valeur précédente ») :
// un second rendu avec les mêmes lignes ne change rien.
export function useLignesNouvelles(lignes, cle = 'id') {
  const vues = useRef(undefined);
  const connues = useRef(null);
  const marquees = useRef(new Map());
  if (vues.current !== lignes) {
    vues.current = lignes;
    const maintenant = Date.now();
    for (const [c, fin] of marquees.current) if (fin <= maintenant) marquees.current.delete(c);
    if (niveauCourant() !== 'reduit') {
      for (const c of clesNouvelles(lignes, connues.current, cle)) marquees.current.set(c, maintenant + DUREE_SURLIGNAGE_MS);
    }
    if (Array.isArray(lignes)) connues.current = new Set(lignes.map((l) => l?.[cle]));
  }
  return (c) => (marquees.current.get(c) ?? 0) > Date.now();
}
