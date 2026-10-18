import { useSyncExternalStore } from 'react';

// Menu court : on montre d'abord les écrans de tous les jours ; le reste est rangé dans « Plus d'outils ».
// Rien n'est retiré (mêmes écrans, mêmes droits) : seulement replié. Un écran ouvert ces 30 derniers jours
// sur cet appareil remonte tout seul dans le menu court. Choix de l'appareil, la base n'est pas concernée.
export const PAGES_ESSENTIELLES = [
  'mise-en-service', 'accueil', 'tableau-de-bord',
  'caisse', 'salle', 'cuisine', 'hotel', 'chambres', 'boutique',
  'ventes', 'clotures', 'qui-me-doit', 'factures',
  'articles', 'stock', 'depenses', 'contacts', 'parametres',
];

const CLE_RECENTS = 'menu-recents';
const CLE_PLUS = 'menu-plus-ouvert';
const EVENEMENT = 'menu-essentiel';
const DUREE_RECENT = 30 * 24 * 3600 * 1000;
// En dessous de ce nombre d'écrans en plus, replier ne simplifie rien : tout reste visible.
const MINIMUM_REPLIE = 3;

function lire(cle) {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle, valeur) {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible (navigation privée) : le menu reste juste sans mémoire.
  }
}

export function lireRecents(maintenant = Date.now()) {
  try {
    const brut = JSON.parse(lire(CLE_RECENTS) ?? '{}');
    return Object.fromEntries(Object.entries(brut).filter(([, t]) => typeof t === 'number' && maintenant - t < DUREE_RECENT));
  } catch {
    return {};
  }
}

// Retient qu'un écran a été ouvert (appelé à chaque changement de page).
export function noterPageOuverte(id, maintenant = Date.now()) {
  if (!id) return;
  const recents = lireRecents(maintenant);
  if (PAGES_ESSENTIELLES.includes(id) || recents[id]) {
    // Déjà visible : on rafraîchit la date sans prévenir le menu (pas de nouveau rendu).
    if (recents[id]) ecrire(CLE_RECENTS, JSON.stringify({ ...recents, [id]: maintenant }));
    return;
  }
  ecrire(CLE_RECENTS, JSON.stringify({ ...recents, [id]: maintenant }));
  window.dispatchEvent(new Event(EVENEMENT));
}

export function lirePlusOuvert() {
  return lire(CLE_PLUS) === 'oui';
}

export function ecrirePlusOuvert(ouvert) {
  ecrire(CLE_PLUS, ouvert ? 'oui' : 'non');
  window.dispatchEvent(new Event(EVENEMENT));
}

function abonner(rappel) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener('storage', rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener('storage', rappel);
  };
}

const instantane = () => `${lire(CLE_RECENTS) ?? ''}|${lire(CLE_PLUS) ?? ''}`;

// Relit le menu quand on ouvre un nouvel écran ou qu'on déplie « Plus d'outils ».
export function useMenuEssentiel() {
  useSyncExternalStore(abonner, instantane, () => '');
  return { recents: lireRecents(), plusOuvert: lirePlusOuvert() };
}

// Sépare le menu : écrans de tous les jours (+ récents + écran affiché) et le reste, replié.
export function separerMenu(pages, { recents = {}, pageActive } = {}) {
  const courtes = pages.filter((p) => PAGES_ESSENTIELLES.includes(p.id) || recents[p.id] || p.id === pageActive);
  const autres = pages.filter((p) => !courtes.includes(p));
  // Personne ne doit se retrouver avec un menu vide ou un « Plus » presque vide.
  if (!courtes.length || autres.length < MINIMUM_REPLIE) return { courtes: pages, autres: [] };
  return { courtes, autres };
}
