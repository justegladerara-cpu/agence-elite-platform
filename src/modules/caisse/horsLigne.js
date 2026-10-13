// Caisse sans internet (2026-10-13) : file des ventes faites sur l'appareil pendant une coupure de connexion.
// Chaque vente reçoit une clé (uuid) au moment où elle est faite ; elle part par enregistrer_vente_hors_ligne
// (migration 20261013000138) qui ne crée jamais deux ventes pour la même clé. Une vente n'est retirée de la file que
// quand la base l'a reçue. Refusée pour une raison de caisse (stock, droit, caisse fermée…) : elle reste, marquée
// « à vérifier » avec le message, jusqu'à ce qu'un responsable décide.
// Tout est dans le stockage de l'appareil (localStorage), par établissement ; chaque vente garde sa caisse (session) et
// la personne qui l'a faite. Lecture et écriture protégées : sans stockage, la caisse marche comme avant, en ligne.
import { estErreurReseau } from '../../noyau/envoi.js';

export const EVENEMENT_FILE_HORS_LIGNE = 'caisse-hors-ligne';
export const FONCTION_ENVOI = 'enregistrer_vente_hors_ligne';
const PREFIXE = 'caisse-hors-ligne:';
const PREFIXE_RETIREES = 'caisse-hors-ligne-retirees:';
const PREFIXE_COPIE = 'caisse-copie:';

const stockageParDefaut = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

function lireJson(cle, stockage) {
  try {
    const brut = stockage?.getItem(cle);
    const valeur = brut ? JSON.parse(brut) : null;
    return valeur;
  } catch {
    return null;
  }
}

function signalerChangement(etab) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent(EVENEMENT_FILE_HORS_LIGNE, { detail: { etab } }));
  } catch {
    // Hors navigateur (tests) : rien à prévenir.
  }
}

export function lireFile(etab, stockage = stockageParDefaut()) {
  const liste = lireJson(PREFIXE + etab, stockage);
  return Array.isArray(liste) ? liste : [];
}

// Écriture : une erreur (stockage plein ou interdit) remonte, pour que la caisse ne perde jamais une vente en silence.
function ecrireFile(etab, liste, stockage) {
  if (!stockage) throw new Error('Cet appareil ne peut pas garder la vente (stockage indisponible)');
  try {
    if (liste.length) stockage.setItem(PREFIXE + etab, JSON.stringify(liste));
    else stockage.removeItem(PREFIXE + etab);
  } catch {
    throw new Error('Cet appareil ne peut pas garder la vente (mémoire pleine) : reconnectez-vous à internet pour vendre');
  }
  signalerChangement(etab);
}

function modifier(etab, cle, changement, stockage) {
  const liste = lireFile(etab, stockage);
  const suivante = liste.map((v) => (v.cle === cle ? { ...v, ...changement(v) } : v));
  ecrireFile(etab, suivante, stockage);
  return suivante.find((v) => v.cle === cle) ?? null;
}

export function nouvelleCle() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const octets = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(octets);
  else for (let i = 0; i < 16; i += 1) octets[i] = Math.floor(Math.random() * 256);
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const h = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// vente : { params (arguments de enregistrer_vente_hors_ligne, p_cle compris), ticket (pour l'affichage), utilisateur_id }.
export function ajouterVente(etab, vente, { stockage = stockageParDefaut(), maintenant = Date.now() } = {}) {
  const cle = vente.params?.p_cle;
  if (!cle) throw new Error('Clé de vente manquante');
  const liste = lireFile(etab, stockage);
  if (liste.some((v) => v.cle === cle)) return liste.find((v) => v.cle === cle);
  const entree = {
    cle,
    session_id: vente.params.p_session_id,
    utilisateur_id: vente.utilisateur_id ?? null,
    cree_le: new Date(maintenant).toISOString(),
    statut: 'en_attente',
    essais: 0,
    prochain_essai: 0,
    message: null,
    params: vente.params,
    ticket: vente.ticket ?? null,
  };
  ecrireFile(etab, [...liste, entree], stockage);
  return entree;
}

// Ventes pas encore reçues par la base (à vérifier comprises), d'une caisse ou de toutes.
export const ventesNonEnvoyees = (liste, sessionId) => liste.filter((v) => !sessionId || v.session_id === sessionId);
export const ventesEnAttente = (liste, sessionId) => ventesNonEnvoyees(liste, sessionId).filter((v) => v.statut === 'en_attente');
export const ventesAVerifier = (liste, sessionId) => ventesNonEnvoyees(liste, sessionId).filter((v) => v.statut === 'a_verifier');

// Quantités vendues sur l'appareil et pas encore envoyées : retirées du stock affiché par la caisse.
export function quantitesNonEnvoyees(liste) {
  const total = {};
  for (const v of liste) {
    for (const l of v.params?.p_lignes ?? []) total[l.article_id] = (total[l.article_id] ?? 0) + Number(l.quantite || 0);
  }
  return total;
}

export function marquerEnvoyee(etab, cle, { stockage = stockageParDefaut() } = {}) {
  ecrireFile(etab, lireFile(etab, stockage).filter((v) => v.cle !== cle), stockage);
}

// Attente avant le prochain essai : 2 s, 4 s, 8 s… jusqu'à 1 minute.
export const delaiReprise = (essais) => Math.min(2000 * 2 ** Math.max(essais - 1, 0), 60000);

export function marquerEchecReseau(etab, cle, { stockage = stockageParDefaut(), maintenant = Date.now() } = {}) {
  return modifier(etab, cle, (v) => ({ essais: v.essais + 1, prochain_essai: maintenant + delaiReprise(v.essais + 1) }), stockage);
}

export function marquerAVerifier(etab, cle, message, { stockage = stockageParDefaut() } = {}) {
  return modifier(etab, cle, () => ({ statut: 'a_verifier', message: String(message ?? 'Vente refusée') }), stockage);
}

// « Réessayer » : la vente repart avec la même clé (aucun doublon possible).
export function reessayer(etab, cle, { stockage = stockageParDefaut() } = {}) {
  return modifier(etab, cle, () => ({ statut: 'en_attente', essais: 0, prochain_essai: 0, message: null }), stockage);
}

// Un responsable retire une vente à vérifier (déjà saisie autrement, vente fictive…). Elle est gardée à part sur
// l'appareil avec qui l'a retirée et pourquoi : rien ne disparaît sans trace.
export function retirerVente(etab, cle, { par, motif } = {}, { stockage = stockageParDefaut(), maintenant = Date.now() } = {}) {
  const liste = lireFile(etab, stockage);
  const vente = liste.find((v) => v.cle === cle);
  if (!vente) return;
  if (!String(motif ?? '').trim()) throw new Error('Indiquez pourquoi cette vente est retirée');
  const retirees = lireJson(PREFIXE_RETIREES + etab, stockage);
  try {
    stockage.setItem(PREFIXE_RETIREES + etab, JSON.stringify([
      ...(Array.isArray(retirees) ? retirees : []).slice(-49),
      { ...vente, retiree_le: new Date(maintenant).toISOString(), retiree_par: par ?? null, motif_retrait: String(motif).trim() },
    ]));
  } catch {
    throw new Error('Impossible de garder la trace du retrait sur cet appareil');
  }
  ecrireFile(etab, liste.filter((v) => v.cle !== cle), stockage);
}

export const lireRetirees = (etab, stockage = stockageParDefaut()) => {
  const liste = lireJson(PREFIXE_RETIREES + etab, stockage);
  return Array.isArray(liste) ? liste : [];
};

// Coupure de connexion (ou base pas encore prête) : on réessaiera. Tout autre refus vient de la caisse elle-même.
export function estErreurPassagere(err) {
  if (estErreurReseau(err)) return true;
  return /JWT expired|jwt|Could not find the function|schema cache|timeout|timed out|\b50[234]\b|Service Unavailable|Bad Gateway|Session expirée/i
    .test(String(err?.message ?? err ?? ''));
}

export const horsLigneMaintenant = (nav = globalThis.navigator) => nav?.onLine === false;

// Envoie les ventes en attente, dans l'ordre où elles ont été faites. Seules celles de la personne connectée partent
// (la base refuserait la caisse d'une autre personne). Coupure : on s'arrête et on garde l'ordre pour le prochain
// essai. Refus de la caisse : la vente passe « à vérifier » et les suivantes continuent.
export async function envoyerFile({ etab, api, utilisateurId, stockage = stockageParDefaut(), maintenant = Date.now(), forcer = false, surEnvoyee } = {}) {
  const bilan = { envoyees: 0, aVerifier: 0, coupure: false };
  for (const vente of lireFile(etab, stockage)) {
    if (vente.statut !== 'en_attente') continue;
    if (utilisateurId && vente.utilisateur_id && vente.utilisateur_id !== utilisateurId) continue;
    if (!forcer && vente.prochain_essai > maintenant) {
      bilan.coupure = true;
      break;
    }
    try {
      const resultat = await api.rpc(FONCTION_ENVOI, vente.params);
      marquerEnvoyee(etab, vente.cle, { stockage });
      bilan.envoyees += 1;
      surEnvoyee?.(vente, resultat);
    } catch (err) {
      if (estErreurPassagere(err)) {
        marquerEchecReseau(etab, vente.cle, { stockage, maintenant });
        bilan.coupure = true;
        break;
      }
      marquerAVerifier(etab, vente.cle, err?.message, { stockage });
      bilan.aVerifier += 1;
    }
  }
  return bilan;
}

// Contrôle sur l'appareil, avant de garder une vente sans connexion : mêmes règles que la base quand on peut les
// connaître (panier, prix, stock, remise, paiements, crédit). Renvoie les montants du ticket.
// lignes : [{ article_id, quantite, remise? }] (lignesPourVente) ; articles : par id ; stock : quantités disponibles.
export function controlerVenteLocale({ lignes, articles, paiements = [], contactId = null, remise = 0, stock = null, stockNegatif = false }) {
  if (!lignes?.length) throw new Error('Le panier est vide');
  const arrondi = (n) => Math.round(n * 100) / 100;
  let sousTotal = 0;
  const lignesTicket = [];
  const besoin = {};
  for (const l of lignes) {
    const a = articles[l.article_id];
    if (!a || a.actif === false) throw new Error('Article inconnu ou archivé : retirez-le du panier');
    const quantite = Number(l.quantite);
    if (!(quantite > 0)) throw new Error('Quantité invalide');
    const brut = arrondi(Number(a.prix_vente) * quantite);
    const remiseLigne = arrondi(Number(l.remise || 0));
    if (remiseLigne < 0 || remiseLigne > brut) throw new Error(`Remise invalide pour « ${a.nom} »`);
    sousTotal += brut - remiseLigne;
    besoin[a.id] = (besoin[a.id] ?? 0) + quantite;
    lignesTicket.push({ libelle: a.nom, quantite, prix_unitaire: Number(a.prix_vente), remise: remiseLigne, total: arrondi(brut - remiseLigne) });
  }
  if (stock && !stockNegatif) {
    for (const [id, q] of Object.entries(besoin)) {
      const a = articles[id];
      if (a.suivi_stock && (stock[id] ?? 0) < q) throw new Error(`Stock insuffisant pour « ${a.nom} » (disponible : ${Math.max(stock[id] ?? 0, 0)})`);
    }
  }
  sousTotal = arrondi(sousTotal);
  const remiseGlobale = arrondi(Number(remise || 0));
  if (remiseGlobale < 0 || remiseGlobale > sousTotal) throw new Error('Remise globale invalide');
  const total = arrondi(sousTotal - remiseGlobale);
  let verse = 0;
  let horsEspeces = 0;
  for (const p of paiements) {
    const m = Number(p.montant);
    if (!(m > 0)) throw new Error('Montant de paiement invalide');
    verse += m;
    if (p.mode !== 'especes') horsEspeces += m;
  }
  if (horsEspeces > total) throw new Error('Les paiements hors espèces dépassent le total de la vente');
  const monnaie = Math.max(arrondi(verse - total), 0);
  const paye = arrondi(verse - monnaie);
  if (paye < total && !contactId) throw new Error('Vente à crédit : choisissez le contact qui doit le reste');
  // Comme la base : la monnaie rendue sort des espèces.
  let aRendre = monnaie;
  const paiementsTicket = paiements.map((p) => {
    let m = Number(p.montant);
    if (p.mode === 'especes') {
      const retire = Math.min(aRendre, m);
      m -= retire;
      aRendre -= retire;
    }
    return { mode: p.mode, montant: arrondi(m), reference: p.reference || null, statut: 'valide' };
  }).filter((p) => p.montant > 0);
  return { lignes: lignesTicket, paiements: paiementsTicket, sousTotal, remise: remiseGlobale, total, verse: arrondi(verse), paye, monnaie, reste: arrondi(total - paye) };
}

// Copie de ce dont la caisse a besoin (articles, prix, stock, caisses…) pour continuer sans connexion après un
// rechargement de l'écran. Photos lourdes et données de contact non nécessaires retirées.
export function garderCopie(cle, donnees, { stockage = stockageParDefaut(), maintenant = Date.now() } = {}) {
  try {
    const allegees = {
      ...donnees,
      articles: (donnees.articles ?? []).map((a) => (a.photo && String(a.photo).length > 2000 ? { ...a, photo: null } : a)),
      contacts: (donnees.contacts ?? []).map((c) => ({ id: c.id, nom: c.nom, type: c.type })),
    };
    stockage?.setItem(PREFIXE_COPIE + cle, JSON.stringify({ le: maintenant, donnees: allegees }));
  } catch {
    // Mémoire pleine : la caisse marche en ligne ; seule la reprise après rechargement sans connexion est perdue.
  }
}

export function lireCopie(cle, { stockage = stockageParDefaut() } = {}) {
  const copie = lireJson(PREFIXE_COPIE + cle, stockage);
  return copie?.donnees ? copie : null;
}

// Charge les données de la caisse ; sans connexion, reprend la dernière copie gardée sur l'appareil.
export async function chargerAvecCopie(cle, charger, options = {}) {
  try {
    const donnees = await charger();
    garderCopie(cle, donnees, options);
    return donnees;
  } catch (err) {
    const copie = estErreurPassagere(err) ? lireCopie(cle, options) : null;
    if (!copie) throw err;
    return { ...copie.donnees, commandesQr: 0, copieDu: copie.le };
  }
}
