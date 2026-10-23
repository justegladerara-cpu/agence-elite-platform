// Modèle du ticket de vente, réglé dans Paramètres › Ticket de caisse (demande de Juste, 2026-10-23).
// Gardé en texte JSON dans les réglages du module caisse (clé « modele_ticket », migration 20261023000159).
// Sans modèle enregistré, le ticket reste exactement comme avant (clients existants : rien ne change à l'impression).
// Le numéro, la date, les articles, le total, les paiements et le RCCM / NIU connus ne se cachent jamais.

export const CLE_MODELE_TICKET = 'modele_ticket';

// groupe : un trait est tiré entre deux blocs de groupes différents.
export const BLOCS_TICKET = {
  logo: { libelle: 'Logo', groupe: 'entete' },
  nom: { libelle: 'Nom du commerce', groupe: 'entete', fixe: true },
  adresse: { libelle: 'Adresse', groupe: 'entete' },
  telephone: { libelle: 'Téléphone', groupe: 'entete' },
  legal: { libelle: 'RCCM et NIU', groupe: 'entete', fixe: true },
  message_haut: { libelle: 'Message en haut', groupe: 'entete', texte: true },
  numero: { libelle: 'Numéro et date du reçu', groupe: 'infos', fixe: true },
  infos: { libelle: 'Caisse, caissière, serveur, client', groupe: 'infos' },
  articles: { libelle: 'Articles, total et paiement', groupe: 'articles', fixe: true },
  message_bas: { libelle: 'Message en bas', groupe: 'pied', texte: true },
  pied: { libelle: 'Petit texte du bas (Paramètres › Documents)', groupe: 'pied' },
  qr: { libelle: 'QR code (Instagram, WhatsApp, site…)', groupe: 'pied' },
};

export const INFOS_TICKET = [['caisse', 'Caisse'], ['vendeur', 'Vendeur'], ['servi_par', 'Servi par'], ['client', 'Client']];

export const MODELE_PAR_DEFAUT = Object.freeze({
  blocs: ['logo', 'nom', 'adresse', 'telephone', 'legal', 'message_haut', 'numero', 'infos', 'articles', 'message_bas', 'pied', 'qr'],
  caches: ['qr'],
  infos: { caisse: true, vendeur: true, servi_par: true, client: true },
  textes: { message_haut: '', message_bas: '', qr_lien: '', qr_texte: '' },
  taille_logo: 'moyen',
  taille_texte: 'normal',
  largeur: '80',
});

const LIMITE_TEXTE = 300;

// Texte enregistré → modèle complet et propre (un modèle abîmé ou ancien n'empêche jamais d'imprimer).
export function lireModele(texte) {
  let brut = {};
  try {
    brut = typeof texte === 'string' && texte.trim() ? JSON.parse(texte) : (texte && typeof texte === 'object' ? texte : {});
  } catch {
    brut = {};
  }
  const connus = Object.keys(BLOCS_TICKET);
  const ordre = Array.isArray(brut.blocs) ? brut.blocs.filter((b, i, t) => connus.includes(b) && t.indexOf(b) === i) : [];
  // Un bloc ajouté plus tard au logiciel prend sa place par défaut, à la fin de la liste.
  const blocs = [...ordre, ...MODELE_PAR_DEFAUT.blocs.filter((b) => !ordre.includes(b))];
  const caches = (Array.isArray(brut.caches) ? brut.caches : MODELE_PAR_DEFAUT.caches).filter((b) => connus.includes(b) && !BLOCS_TICKET[b].fixe);
  const infos = Object.fromEntries(INFOS_TICKET.map(([id]) => [id, brut.infos?.[id] !== false]));
  const textes = Object.fromEntries(Object.keys(MODELE_PAR_DEFAUT.textes).map((k) => [k, String(brut.textes?.[k] ?? '').slice(0, LIMITE_TEXTE)]));
  return {
    blocs, caches: [...new Set(caches)], infos, textes,
    taille_logo: ['petit', 'moyen', 'grand'].includes(brut.taille_logo) ? brut.taille_logo : 'moyen',
    taille_texte: ['normal', 'grand'].includes(brut.taille_texte) ? brut.taille_texte : 'normal',
    largeur: ['80', '58'].includes(String(brut.largeur)) ? String(brut.largeur) : '80',
  };
}

export const ecrireModele = (modele) => JSON.stringify(lireModele(modele));

export const blocVisible = (modele, id) => BLOCS_TICKET[id]?.fixe || !modele.caches.includes(id);

export function basculerBloc(modele, id) {
  if (BLOCS_TICKET[id]?.fixe) return modele;
  const caches = modele.caches.includes(id) ? modele.caches.filter((b) => b !== id) : [...modele.caches, id];
  return { ...modele, caches };
}

// Monter (-1) ou descendre (+1) un bloc d'une place.
export function deplacerBloc(modele, id, sens) {
  const i = modele.blocs.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= modele.blocs.length) return modele;
  const blocs = [...modele.blocs];
  [blocs[i], blocs[j]] = [blocs[j], blocs[i]];
  return { ...modele, blocs };
}

// Blocs à dessiner, dans l'ordre, avec un trait avant chaque changement de groupe.
export function blocsADessiner(modele) {
  const visibles = modele.blocs.filter((id) => blocVisible(modele, id));
  return visibles.map((id, i) => ({ id, trait: i > 0 && BLOCS_TICKET[visibles[i - 1]].groupe !== BLOCS_TICKET[id].groupe }));
}

// Lien du QR code : http(s) seulement ; un numéro WhatsApp seul devient un lien wa.me.
export function lienQr(texte) {
  const t = String(texte ?? '').trim();
  if (/^https?:\/\/\S+$/i.test(t)) return t;
  const chiffres = t.replace(/[\s.()-]/g, '');
  if (/^\+?\d{8,15}$/.test(chiffres)) return `https://wa.me/${chiffres.replace(/^\+/, '')}`;
  return null;
}
