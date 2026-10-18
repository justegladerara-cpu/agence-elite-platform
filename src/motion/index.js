// Elite Motion System (EMS) : point d'entrée. Voir docs/motion/.
export {
  ACTIVE, CHOIX_ANIMATIONS, NIVEAUX, appliquerAnimations, enregistrerChoixAnimations, lireChoixAnimations,
  niveauCourant, niveauEffectif, suivreSysteme, systemeReduit,
} from './preferences.js';
export { DUREES_NOMBRE, decimalesDe, interpoler, sortieCubique, useNombreAnime } from './nombre.js';
export { DUREE_SURLIGNAGE_MS, clesNouvelles, useLignesNouvelles } from './lignes.js';
export { NombreAnime } from './NombreAnime.jsx';
