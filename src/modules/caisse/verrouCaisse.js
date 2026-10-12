// Présence à la caisse (réglages Clôture « verrouillage_inactivite », migration 20261011000129, et
// « delai_reponse_presence », migration 20261012000132) :
// - à la connexion, si la personne a SA caisse ouverte : « Tu continues ? » ;
// - au bout de N minutes sans toucher l'écran : « Tu es toujours là ? » avec un compte à rebours, puis déconnexion.
// La caisse reste ouverte : elle la retrouve en se reconnectant, et seule elle (ou un responsable) peut la fermer avec
// son ticket Z.
export const DELAI_PAR_DEFAUT_MIN = 15;
export const DELAI_REPONSE_PAR_DEFAUT_MIN = 5;

const minutes = (brut, defaut) => {
  if (brut === undefined || brut === null || brut === '') return defaut;
  const n = Number(brut);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Minutes sans activité avant la question ; 0 = jamais.
export const delaiVerrouillage = (parametresCloture) => minutes(parametresCloture?.verrouillage_inactivite, DELAI_PAR_DEFAUT_MIN);

// Minutes laissées pour répondre ; 0 = déconnexion directe, sans question.
export const delaiReponse = (parametresCloture) => minutes(parametresCloture?.delai_reponse_presence, DELAI_REPONSE_PAR_DEFAUT_MIN);

// 'actif', 'question' (« Tu es toujours là ? ») ou 'deconnecter'. Tout est calculé depuis l'heure de la dernière
// activité : le compte reste juste même si l'onglet a dormi en arrière-plan.
export function etatPresence(derniereActivite, maintenant, delaiMin, reponseMin) {
  if (!delaiMin) return 'actif';
  const ecoule = maintenant - derniereActivite;
  if (ecoule < delaiMin * 60000) return 'actif';
  return ecoule < (delaiMin + reponseMin) * 60000 ? 'question' : 'deconnecter';
}

// Millisecondes restantes avant la déconnexion automatique (jamais négatif).
export const resteAvantDeconnexion = (derniereActivite, maintenant, delaiMin, reponseMin) =>
  Math.max(derniereActivite + (delaiMin + reponseMin) * 60000 - maintenant, 0);

// « 14:59 » (arrondi à la seconde supérieure : on n'affiche 0:00 qu'au moment de la déconnexion).
export function compteARebours(ms) {
  const s = Math.ceil(Math.max(ms, 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Prénom pour « Bonjour Awa » : premier mot du nom du compte, sinon le début de l'adresse e-mail.
export function prenomCaisse(utilisateur) {
  const nom = String(utilisateur?.prenom ?? utilisateur?.nom ?? '').trim().split(/\s+/)[0];
  if (nom) return nom;
  return String(utilisateur?.email ?? '').split('@')[0];
}

// Plusieurs caisses ouvertes : la plus récente.
export const caisseLaPlusRecente = (sessions) =>
  [...(sessions ?? [])].sort((a, b) => String(b.ouverte_le ?? '').localeCompare(String(a.ouverte_le ?? '')))[0] ?? null;

// « 18 h 05 », « hier à 18 h 05 » ou « le 09/10 à 18 h 05 » (heure de l'appareil).
export function heureOuverture(iso, maintenant = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86400000);
  if (ecart === 0) return heure;
  if (ecart === 1) return `hier à ${heure}`;
  return `le ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${heure}`;
}

// « Tu continues ? » une seule fois par connexion (onglet). Effacé à la déconnexion.
const CLE_ACCUEIL = 'ae-caisse-accueil';
export function accueilDejaVu(stockage, utilisateurId) {
  try { return stockage?.getItem(CLE_ACCUEIL) === String(utilisateurId); } catch { return false; }
}
export function noterAccueilVu(stockage, utilisateurId) {
  try { stockage?.setItem(CLE_ACCUEIL, String(utilisateurId)); } catch { /* stockage indisponible */ }
}
export function oublierAccueil(stockage) {
  try { stockage?.removeItem(CLE_ACCUEIL); } catch { /* stockage indisponible */ }
}

// Activité partagée entre les onglets : répondre dans un onglet ferme la question dans les autres.
export const CLE_ACTIVITE = 'ae-caisse-activite';

// Prévient l'écran Caisse qu'une caisse vient d'être fermée depuis le pop-up (il recharge ses données).
export const EVENEMENT_CAISSE_FERMEE = 'ae-caisse-fermee';
