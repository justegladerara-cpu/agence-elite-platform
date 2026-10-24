import { useSyncExternalStore } from 'react';

// Elite Simple : le menu ne garde que l'essentiel du petit commerce (vendre, stock, argent, clients).
// Choix de l'appareil (localStorage : 'oui' / 'non') ; sans choix, le réglage de l'établissement s'applique
// (Paramètres › Tableau de bord › « Elite Simple pour toute l'équipe », migration 20261012000130).
// La base n'est pas concernée : les droits restent les mêmes.
const CLE = 'mode-simple';
const cleDefaut = (etablissementId) => `mode-simple-defaut-${etablissementId}`;
const EVENEMENT = 'mode-simple';

// Écrans gardés dans le menu en Elite Simple (ceux que la personne a le droit d'ouvrir).
export const PAGES_MODE_SIMPLE = [
  'accueil', 'caisse', 'ventes', 'z-et-rapports', 'clotures', 'qui-me-doit', 'a-qui-je-dois', 'articles', 'stock', 'achats',
  'depenses', 'contacts', 'factures', 'menu-qr', 'qr-codes', 'commandes-qr', 'rapport-du-soir',
];

function lire(cle) {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle, valeur) {
  try {
    if (valeur == null) window.localStorage.removeItem(cle);
    else window.localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible (navigation privée) : le choix vaut pour cette page seulement.
  }
}

export function lireModeSimple(etablissementId) {
  const choix = lire(CLE);
  if (choix === 'oui') return true;
  if (choix === 'non') return false;
  return Boolean(etablissementId) && lire(cleDefaut(etablissementId)) === 'oui';
}

// Choix fait sur cet appareil (case de l'accueil) : il passe avant le réglage de l'établissement.
export function ecrireModeSimple(actif) {
  ecrire(CLE, actif ? 'oui' : 'non');
  window.dispatchEvent(new Event(EVENEMENT));
}

// Réglage de l'établissement, lu à l'ouverture de l'espace et retenu pour les ouvertures suivantes.
export function ecrireDefautEtablissement(etablissementId, actif) {
  if (!etablissementId) return;
  const avant = lire(cleDefaut(etablissementId));
  ecrire(cleDefaut(etablissementId), actif ? 'oui' : null);
  if (avant !== (actif ? 'oui' : null)) window.dispatchEvent(new Event(EVENEMENT));
}

function abonner(rappel) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener('storage', rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener('storage', rappel);
  };
}

export function useModeSimple(etablissementId) {
  return useSyncExternalStore(abonner, () => lireModeSimple(etablissementId), () => false);
}

export function filtrerModeSimple(pages, actif) {
  if (!actif) return pages;
  const gardees = pages.filter((p) => PAGES_MODE_SIMPLE.includes(p.id));
  // Personne ne doit se retrouver avec un menu vide : sans écran essentiel, le menu complet reste.
  return gardees.length ? gardees : pages;
}
