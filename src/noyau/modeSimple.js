import { useSyncExternalStore } from 'react';

// Mode simple : le menu ne garde que l'essentiel du petit commerce (vendre, stock, argent, clients).
// Préférence de l'appareil (localStorage) ; la base n'est pas concernée : les droits restent les mêmes.
const CLE = 'mode-simple';
const EVENEMENT = 'mode-simple';

// Écrans gardés dans le menu en mode simple (ceux que la personne a le droit d'ouvrir).
export const PAGES_MODE_SIMPLE = [
  'accueil', 'caisse', 'ventes', 'clotures', 'qui-me-doit', 'a-qui-je-dois', 'articles', 'stock', 'achats',
  'depenses', 'contacts', 'factures',
];

export function lireModeSimple() {
  try {
    return window.localStorage.getItem(CLE) === 'oui';
  } catch {
    return false;
  }
}

export function ecrireModeSimple(actif) {
  try {
    if (actif) window.localStorage.setItem(CLE, 'oui');
    else window.localStorage.removeItem(CLE);
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cette page seulement.
  }
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

export function useModeSimple() {
  return useSyncExternalStore(abonner, lireModeSimple, () => false);
}

export function filtrerModeSimple(pages, actif) {
  if (!actif) return pages;
  const gardees = pages.filter((p) => PAGES_MODE_SIMPLE.includes(p.id));
  // Personne ne doit se retrouver avec un menu vide : sans écran essentiel, le menu complet reste.
  return gardees.length ? gardees : pages;
}
