// Page mobile d'un QR code (migration 20261023000160) : blocs, page de départ, liens des boutons. Logique pure,
// testée dans tests/page_mobile_qr_ecran.test.jsx. La base revérifie tout (blocs_page_qr_verifies).
import { lienMenu, lienTelephone, lienWhatsapp, destinationQr } from '../../noyau/qrContenus.js';

export const TYPES_BLOCS = {
  entete: { libelle: 'En-tête', detail: 'Logo, titre et petite phrase' },
  texte: { libelle: 'Texte', detail: 'Horaires, adresse, une annonce…' },
  bouton: { libelle: 'Bouton', detail: 'Instagram, WhatsApp, appel, lien…' },
  menu: { libelle: 'Menu', detail: 'Vos articles et leurs prix' },
  formulaire: { libelle: 'Inscription des clients', detail: 'Nom, téléphone… pour vos offres' },
};

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
    case 'bouton': return { type, libelle: 'Écrivez-nous sur WhatsApp', action: 'whatsapp', valeur: '' };
    case 'menu': return { type, titre: 'Notre carte' };
    case 'formulaire': return { type, titre: 'Recevez nos offres', texte: 'Laissez votre numéro : nous vous prévenons des soirées et promotions.', bouton: 'Je m’inscris', merci: 'Merci ! À très bientôt.', email: false, anniversaire: true, message: false };
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
    case 'whatsapp': return String(bloc.valeur ?? '').replace(/\D/g, '').length >= 8 ? lienWhatsapp(bloc.valeur) : null;
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
