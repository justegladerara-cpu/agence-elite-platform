// Elite Motion System (EMS) : niveau d'animation de l'interface, propre à l'appareil.
// Couche de présentation seulement : aucun droit, aucune donnée, aucun appel à la base.
// Voir docs/motion/MOTION_ARCHITECTURE.md.
//
// Interrupteur unique : l'attribut data-animations de <html> ('complet' | 'equilibre' | 'leger' | 'reduit').
// Toutes les règles de src/motion/motion.css et le hook useNombreAnime le lisent. Mettre ACTIVE à false
// (ou retirer l'import de motion.css dans src/main.jsx) coupe tout l'EMS d'un coup.
export const ACTIVE = true;

const CLE = 'ae-animations';

export const NIVEAUX = ['complet', 'equilibre', 'leger', 'reduit'];

export const CHOIX_ANIMATIONS = [
  ['auto', 'Comme l’appareil'],
  ['complet', 'Complètes'],
  ['equilibre', 'Équilibrées'],
  ['leger', 'Légères (fondus seulement)'],
  ['reduit', 'Réduites (aucun mouvement)'],
];

// Le réglage « Réduire les animations » du système d'exploitation passe avant tout choix « auto ».
export function systemeReduit(fenetre = typeof window === 'undefined' ? undefined : window) {
  try {
    return Boolean(fenetre?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

export function lireChoixAnimations(stockage = typeof localStorage === 'undefined' ? undefined : localStorage) {
  try {
    const valeur = stockage?.getItem(CLE);
    return CHOIX_ANIMATIONS.some(([v]) => v === valeur) ? valeur : 'auto';
  } catch {
    return 'auto';
  }
}

// Niveau réellement appliqué. « auto » : équilibré, ou réduit si le système le demande.
// Quand le système demande moins de mouvement, un choix « complet » ou « équilibré » descend à « léger »
// (fondus courts, aucun déplacement) : jamais de mouvement pour une personne qui l'a refusé sur son appareil.
export function niveauEffectif(choix, reduit) {
  if (!ACTIVE) return 'reduit';
  if (choix === 'auto' || !NIVEAUX.includes(choix)) return reduit ? 'reduit' : 'equilibre';
  if (reduit && (choix === 'complet' || choix === 'equilibre')) return 'leger';
  return choix;
}

export function appliquerAnimations(choix = lireChoixAnimations(), racine = typeof document === 'undefined' ? undefined : document.documentElement) {
  const niveau = niveauEffectif(choix, systemeReduit());
  if (racine) racine.dataset.animations = niveau;
  return niveau;
}

export function enregistrerChoixAnimations(choix, stockage = typeof localStorage === 'undefined' ? undefined : localStorage) {
  const propre = CHOIX_ANIMATIONS.some(([v]) => v === choix) ? choix : 'auto';
  try {
    if (propre === 'auto') stockage?.removeItem(CLE);
    else stockage?.setItem(CLE, propre);
  } catch {
    // Choix non mémorisé : il s'applique quand même jusqu'au rechargement.
  }
  appliquerAnimations(propre);
  return propre;
}

// Niveau courant lu sur <html> (défaut prudent : réduit tant que rien n'est posé, par exemple dans les tests).
export function niveauCourant(racine = typeof document === 'undefined' ? undefined : document.documentElement) {
  const n = racine?.dataset?.animations;
  return NIVEAUX.includes(n) ? n : 'reduit';
}

// Suit le réglage du système et la visibilité de l'onglet. Renvoie la fonction d'arrêt (écouteurs retirés).
// Onglet caché : data-page-cachee sur <html> met en pause les animations en boucle (squelettes, rouets).
export function suivreSysteme(fenetre = typeof window === 'undefined' ? undefined : window) {
  if (!fenetre?.document) return () => {};
  const doc = fenetre.document;
  const racine = doc.documentElement;
  const visibilite = () => {
    if (doc.visibilityState === 'hidden') racine.dataset.pageCachee = 'oui';
    else delete racine.dataset.pageCachee;
  };
  const requete = (() => { try { return fenetre.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch { return null; } })();
  const changement = () => appliquerAnimations();
  doc.addEventListener('visibilitychange', visibilite);
  requete?.addEventListener?.('change', changement);
  visibilite();
  return () => {
    doc.removeEventListener('visibilitychange', visibilite);
    requete?.removeEventListener?.('change', changement);
  };
}
