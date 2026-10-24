// Écrans affichés ou cachés, réglés dans Paramètres > Applications (demande de Juste, 2026-10-23) : le patron cache
// ce que son établissement n'utilise pas. Un écran caché disparaît du menu et des gros boutons de l'accueil ; ses
// données restent en base. Réglage : etablissement_parametres, module « etablissement », clé pages_cachees
// (identifiants séparés par des virgules, migration 20261023200156).
export const CLE_PAGES_CACHEES = 'pages_cachees';
export const CLE_VERSION = 'pages_cachees_version';

// Jamais encore réglé : ces écrans sont cachés (Juste ne s'en sert pas).
export const PAGES_CACHEES_PAR_DEFAUT = ['happy-hour', 'reserves', 'menu-qr'];

// Version 2 (2026-10-24, The Dream client modèle) : « Offerts et pertes » passe dans « Ticket Z et rapports » ;
// « Emballages consignés » et « Préparer la commande » sont cachés.
// Une liste enregistrée avant (version 1) reçoit ces écrans en plus ; on peut toujours les rallumer.
export const VERSION_PAGES = 2;
export const PAGES_CACHEES_V2 = ['offerts-pertes', 'emballages', 'preparer-commande'];

// Toujours visibles : sans eux, on ne peut plus rien rallumer.
export const PAGES_TOUJOURS_VISIBLES = ['accueil', 'parametres', 'applications'];

// reglages : { [module_id]: data } lus dans etablissement_parametres.
export function pagesCachees(reglages) {
  const data = reglages?.etablissement;
  const texte = data?.[CLE_PAGES_CACHEES];
  if (typeof texte !== 'string') return [...PAGES_CACHEES_PAR_DEFAUT, ...PAGES_CACHEES_V2];
  const liste = texte.split(',').map((x) => x.trim()).filter(Boolean);
  if (Number(data?.[CLE_VERSION] ?? 1) >= VERSION_PAGES) return liste;
  return [...new Set([...liste, ...PAGES_CACHEES_V2])];
}

export function pageEteinte(reglages, pageId) {
  return !PAGES_TOUJOURS_VISIBLES.includes(pageId) && pagesCachees(reglages).includes(pageId);
}

export const fonctionActive = (reglages, pageId) => !pageEteinte(reglages, pageId);

// Réglages à enregistrer après un geste sur l'interrupteur d'un écran (la liste est alors en version 2).
export const reglagesApresBascule = (reglages, pageId) => ({ [CLE_PAGES_CACHEES]: basculerPage(reglages, pageId), [CLE_VERSION]: VERSION_PAGES });

// Nouvelle liste après un geste sur l'interrupteur d'un écran.
export function basculerPage(reglages, pageId) {
  const liste = pagesCachees(reglages);
  return (liste.includes(pageId) ? liste.filter((x) => x !== pageId) : [...liste, pageId]).join(',');
}
