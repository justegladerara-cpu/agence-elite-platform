// Écrans affichés ou cachés, réglés dans Paramètres > Applications (demande de Juste, 2026-10-23) : le patron cache
// ce que son établissement n'utilise pas. Un écran caché disparaît du menu et des gros boutons de l'accueil ; ses
// données restent en base. Réglage : etablissement_parametres, module « etablissement », clé pages_cachees
// (identifiants séparés par des virgules, migration 20261023000156).
export const CLE_PAGES_CACHEES = 'pages_cachees';

// Jamais encore réglé : ces écrans sont cachés (Juste ne s'en sert pas).
export const PAGES_CACHEES_PAR_DEFAUT = ['happy-hour', 'reserves', 'menu-qr'];

// Toujours visibles : sans eux, on ne peut plus rien rallumer.
export const PAGES_TOUJOURS_VISIBLES = ['accueil', 'parametres', 'applications'];

// reglages : { [module_id]: data } lus dans etablissement_parametres.
export function pagesCachees(reglages) {
  const texte = reglages?.etablissement?.[CLE_PAGES_CACHEES];
  if (typeof texte !== 'string') return PAGES_CACHEES_PAR_DEFAUT;
  return texte.split(',').map((x) => x.trim()).filter(Boolean);
}

export function pageEteinte(reglages, pageId) {
  return !PAGES_TOUJOURS_VISIBLES.includes(pageId) && pagesCachees(reglages).includes(pageId);
}

export const fonctionActive = (reglages, pageId) => !pageEteinte(reglages, pageId);

// Nouvelle liste après un geste sur l'interrupteur d'un écran.
export function basculerPage(reglages, pageId) {
  const liste = pagesCachees(reglages);
  return (liste.includes(pageId) ? liste.filter((x) => x !== pageId) : [...liste, pageId]).join(',');
}
