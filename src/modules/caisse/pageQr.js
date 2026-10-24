// Page mobile d'un QR code (migration 20261023200160) : blocs, page de départ, liens des boutons. Logique pure,
// testée dans tests/page_mobile_qr_ecran.test.jsx. La base revérifie tout (blocs_page_qr_verifies).
import { lienMenu, lienTelephone, lienWhatsapp, destinationQr } from '../../noyau/qrContenus.js';

export const TYPES_BLOCS = {
  entete: { libelle: 'En-tête', detail: 'Logo, titre et petite phrase' },
  texte: { libelle: 'Texte', detail: 'Horaires, adresse, une annonce…' },
  bouton: { libelle: 'Bouton', detail: 'Instagram, WhatsApp, appel, lien…' },
  menu: { libelle: 'Menu', detail: 'Vos articles et leurs prix' },
  formulaire: { libelle: 'Inscription des clients', detail: 'Nom, prénom, WhatsApp… pour vos offres' },
  reseaux: { libelle: 'Réseaux sociaux', detail: 'Instagram, Facebook, TikTok…' },
  wifi: { libelle: 'Code Wi-Fi', detail: 'Nom du Wi-Fi et mot de passe' },
};

// Réseaux sociaux proposés (bloc « reseaux ») : lien https, WhatsApp par numéro. Ordre d'affichage.
export const RESEAUX = [
  ['instagram', 'Instagram', 'https://instagram.com/…'],
  ['facebook', 'Facebook', 'https://facebook.com/…'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@…'],
  ['youtube', 'YouTube', 'https://youtube.com/…'],
  ['whatsapp', 'WhatsApp', '+242 06 123 45 67'],
];

export const ACTIONS_BOUTON = [
  ['destination', 'La destination du QR code'],
  ['whatsapp', 'WhatsApp'],
  ['appel', 'Appel'],
  ['lien', 'Un lien (Instagram, Facebook, site…)'],
  ['menu', 'Le menu (plus bas sur la page)'],
];

export const MAX_BLOCS = 25;

export function nouveauBloc(type) {
  switch (type) {
    case 'entete': return { type, titre: 'Bienvenue !', texte: '', logo: true };
    case 'texte': return { type, titre: '', texte: '' };
    case 'bouton': return { type, libelle: 'Écrivez-nous sur WhatsApp', action: 'whatsapp', valeur: '', texte: 'Bonjour ! Je viens de scanner votre QR code. Je veux recevoir vos offres et vos soirées.' };
    case 'menu': return { type, titre: 'Notre carte', affichage: 'cartes', recherche: true };
    case 'formulaire': return { type, titre: 'Recevez nos offres', texte: 'Laissez votre numéro : nous vous prévenons des soirées et promotions.', bouton: 'Je m’inscris', merci: 'Merci ! À très bientôt.', email: false, anniversaire: true, message: false };
    case 'reseaux': return { type, titre: 'Suivez-nous' };
    case 'wifi': return { type, titre: 'Notre Wi-Fi', reseau: '', mot_de_passe: '' };
    default: return null;
  }
}

// Première page proposée : en-tête, bouton vers la destination actuelle du QR code, menu, inscription.
export function pageDeDepart(qr, nomEtablissement = '') {
  const blocs = [{ ...nouveauBloc('entete'), titre: nomEtablissement ? `Bienvenue chez ${nomEtablissement}` : 'Bienvenue !' }];
  if (qr?.type && !['menu', 'wifi'].includes(qr.type)) blocs.push({ type: 'bouton', libelle: qr.nom || 'Ouvrir', action: 'destination' });
  blocs.push(nouveauBloc('menu'), nouveauBloc('formulaire'));
  return blocs;
}

export function deplacer(blocs, i, sens) {
  const j = i + sens;
  if (j < 0 || j >= blocs.length) return blocs;
  const copie = [...blocs];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}

export const retirer = (blocs, i) => blocs.filter((_, k) => k !== i);

// Liens d'un bloc « reseaux » prêts à afficher (les réseaux mal remplis sont ignorés).
export function liensReseaux(bloc) {
  return RESEAUX.map(([cle, nom]) => {
    const v = String(bloc?.[cle] ?? '').trim();
    if (!v) return null;
    if (cle === 'whatsapp') return v.replace(/\D/g, '').length >= 8 ? { cle, nom, lien: lienWhatsapp(v) } : null;
    return /^https?:\/\/[^\s/?#.][^\s]*$/i.test(v) ? { cle, nom, lien: v } : null;
  }).filter(Boolean);
}

export function ajouter(blocs, type) {
  if (blocs.length >= MAX_BLOCS) return blocs;
  if (type === 'formulaire' && blocs.some((b) => b.type === 'formulaire')) return blocs;
  return [...blocs, nouveauBloc(type)];
}

// Où mène un bouton. reponse : ce que renvoie ouvrir_qr_code (destination du QR code). null : bouton inactif.
export function lienBouton(bloc, reponse, origine) {
  switch (bloc.action) {
    case 'destination': {
      if (!reponse) return null;
      if (reponse.type === 'menu') return reponse.menu ? lienMenu(reponse.menu, origine) : null;
      return destinationQr(reponse, origine);
    }
    // Message tout prêt (Juste, 2026-10-24) : WhatsApp s'ouvre avec le texte déjà écrit, le client n'a qu'à envoyer.
    case 'whatsapp': return String(bloc.valeur ?? '').replace(/\D/g, '').length >= 8 ? lienWhatsapp(bloc.valeur, bloc.texte) : null;
    case 'appel': return String(bloc.valeur ?? '').replace(/\D/g, '').length >= 8 ? lienTelephone(bloc.valeur) : null;
    case 'lien': return /^https?:\/\/[^\s/?#.][^\s]*$/i.test(String(bloc.valeur ?? '').trim()) ? String(bloc.valeur).trim() : null;
    case 'menu': return '#page-qr-menu';
    default: return null;
  }
}

// Texte d'export des clients inscrits (CSV, séparateur ; lu par Excel en français).
export function csvInscrits(inscrits, nomsQr = {}) {
  const echapper = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lignes = [['Date', 'Nom', 'Téléphone', 'E-mail', 'Anniversaire', 'Message', 'QR code']];
  for (const i of inscrits) {
    lignes.push([String(i.cree_le ?? '').slice(0, 10), i.nom, i.telephone ? `+${i.telephone}` : '', i.email, i.anniversaire, i.message, nomsQr[i.qr_code_id] ?? '']);
  }
  return lignes.map((l) => l.map(echapper).join(';')).join('\r\n');
}

// Menu en cartes (migration 20261024060000) : une carte par rayon, dans l'ordre choisi, sans les rayons cachés.
// menu : page.menu ({ id, nom, photo, articles }) ; bloc : le bloc « menu » ({ cartes, ordre }).
export const CLE_SANS_RAYON = 'autres';

export function titreCarteParDefaut(nom) {
  const n = String(nom ?? '').trim();
  if (!n || n === 'Autres') return 'Autres choix';
  // « Bières » → « Nos bières » ; un nom au singulier reste tel quel (« Whisky »).
  return /[sx]$/i.test(n) && !/\s/.test(n) ? `Nos ${n.charAt(0).toLowerCase()}${n.slice(1)}` : n;
}

export function rayonsMenu(menu, bloc = {}) {
  const cartes = bloc.cartes ?? {};
  const ordre = Array.isArray(bloc.ordre) ? bloc.ordre : [];
  const rang = (id) => {
    const i = ordre.indexOf(id);
    return i < 0 ? ordre.length : i;
  };
  return (menu ?? [])
    .map((c, i) => ({ ...c, id: c.id ?? (c.nom === 'Autres' ? CLE_SANS_RAYON : `rayon-${i}`), position: i }))
    .filter((c) => !cartes[c.id]?.cache && (c.articles ?? []).length)
    .sort((a, b) => rang(a.id) - rang(b.id) || a.position - b.position)
    .map((c) => ({ ...c, titre: cartes[c.id]?.titre || titreCarteParDefaut(c.nom) }));
}

// Recherche dans le menu (sans accents ni majuscules) : articles de tous les rayons visibles.
const sansAccents = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
export function chercherMenu(rayons, texte) {
  const t = sansAccents(texte).trim();
  if (!t) return [];
  return rayons.flatMap((r) => r.articles.filter((a) => sansAccents(a.nom).includes(t) || sansAccents(a.description).includes(t)).map((a) => ({ ...a, rayon: r.id })));
}

// Petite image de secours d'une carte sans photo, d'après le nom du rayon.
const PICTOS = [
  [/bi[eè]re|beer/, '🍺'], [/champagne/, '🍾'], [/vin\b|vins|ros[eé]|wine/, '🍷'], [/cocktail|mojito/, '🍹'],
  [/whisk|vodka|rhum|gin|liqueur|spiritueux|cognac|alcool/, '🥃'], [/caf[eé]|th[eé]\b|chaud/, '☕'], [/eau\b|eaux/, '💧'],
  [/jus|soda|soft|boisson|sucr/, '🥤'], [/chicha|shisha/, '💨'], [/pizza/, '🍕'], [/burger|sandwich/, '🍔'],
  [/frite|snack|ap[eé]ro|amuse/, '🍟'], [/poisson|fruits de mer/, '🐟'], [/grill|viande|brochette|poulet/, '🍖'],
  [/dessert|g[aâ]teau|glace|sucr[eé]/, '🍰'], [/plat|cuisine|repas|menu|entr[eé]e/, '🍽️'],
];
export function pictoRayon(nom) {
  const n = sansAccents(nom);
  return PICTOS.find(([re]) => re.test(n))?.[1] ?? '✨';
}
