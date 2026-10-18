import React from 'react';
import { useNombreAnime } from './nombre.js';

// Affiche un nombre formaté (montant FCFA, pourcentage…) qui glisse vers sa nouvelle valeur quand elle change.
// `format` est le formateur existant de l'écran (ex. useFormat du tableau de bord, formatMontant) : l'EMS n'a pas
// son propre format d'argent. Valeur non numérique (null, texte) : affichée telle quelle par le formateur.
export function NombreAnime({ valeur, format = (v) => String(v ?? ''), duree }) {
  const [affiche, enCours] = useNombreAnime(valeur, { duree });
  return <span className="ems-nombre" data-anime={enCours ? 'oui' : undefined}>{format(affiche)}</span>;
}
