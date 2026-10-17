// Contenu des QR codes : adresses suivies (#/q/), liens WhatsApp, appel, SMS, e-mail, fiche contact (vCard), Wi-Fi,
// balises UTM, période de validité, type d'appareil. Fonctions pures, testées dans tests/qr_logo.test.js.

// Types proposés. suivi : le QR code pointe vers notre page #/q/<jeton> (scan compté, destination modifiable après
// impression). Le Wi-Fi est écrit directement dans le QR code : ni compté, ni modifiable.
export const TYPES_QR = {
  lien: { libelle: 'Lien web', detail: 'Instagram, Facebook, site…', suivi: true },
  avis: { libelle: 'Avis Google', detail: 'Le client laisse un avis', suivi: true },
  whatsapp: { libelle: 'WhatsApp', detail: 'Le client vous écrit en un geste', suivi: true },
  telephone: { libelle: 'Appel', detail: 'Le téléphone compose votre numéro', suivi: true },
  sms: { libelle: 'SMS', detail: 'Un SMS déjà écrit', suivi: true },
  email: { libelle: 'E-mail', detail: 'Un e-mail déjà adressé', suivi: true },
  vcard: { libelle: 'Fiche contact', detail: 'Votre contact enregistré dans le téléphone', suivi: true },
  menu: { libelle: 'Menu', detail: 'Votre menu en ligne, sans table', suivi: true },
  wifi: { libelle: 'Wi-Fi', detail: 'Le téléphone se connecte tout seul', suivi: false },
};

// Origine du site ouvert (sous-domaine du client compris).
const origineCourante = () => (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');

// Adresse publique du menu d'une table : même site que l'écran ouvert.
export function lienMenu(jeton, origine = origineCourante()) {
  return `${origine}#/menu/${jeton}`;
}

// Adresse publique d'un QR code suivi : la page compte le scan puis envoie vers la destination.
export function lienQr(jeton, origine = origineCourante()) {
  return `${origine}#/q/${jeton}`;
}

// Numéro : chiffres seuls, indicatif du pays compris (« 00 » de tête retiré).
export function numeroWhatsapp(numero) {
  return String(numero ?? '').replace(/\D/g, '').replace(/^00/, '');
}

export function lienWhatsapp(numero, message = '') {
  const texte = String(message ?? '').trim();
  return `https://wa.me/${numeroWhatsapp(numero)}${texte ? `?text=${encodeURIComponent(texte)}` : ''}`;
}

export const lienTelephone = (numero) => `tel:+${numeroWhatsapp(numero)}`;

export function lienSms(numero, message = '') {
  const texte = String(message ?? '').trim();
  return `sms:+${numeroWhatsapp(numero)}${texte ? `?body=${encodeURIComponent(texte)}` : ''}`;
}

export function lienEmail(adresse, sujet = '', message = '') {
  const parties = [['subject', sujet], ['body', message]].filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`);
  return `mailto:${String(adresse ?? '').trim()}${parties.length ? `?${parties.join('&')}` : ''}`;
}

// Fiche contact (vCard 3.0), reconnue par Android et iPhone.
export function texteVcard({ prenom = '', nom = '', societe = '', telephone = '', email = '', site = '', adresse = '' } = {}) {
  const e = (t) => String(t ?? '').trim().replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const complet = [prenom, nom].map((t) => String(t ?? '').trim()).filter(Boolean).join(' ') || String(societe ?? '').trim();
  const lignes = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(nom)};${e(prenom)};;;`, `FN:${e(complet)}`];
  if (String(societe ?? '').trim()) lignes.push(`ORG:${e(societe)}`);
  if (numeroWhatsapp(telephone)) lignes.push(`TEL;TYPE=CELL:+${numeroWhatsapp(telephone)}`);
  if (String(email ?? '').trim()) lignes.push(`EMAIL:${e(email)}`);
  if (String(site ?? '').trim()) lignes.push(`URL:${e(site)}`);
  if (String(adresse ?? '').trim()) lignes.push(`ADR;TYPE=WORK:;;${e(adresse)};;;;`);
  lignes.push('END:VCARD');
  return lignes.join('\r\n');
}

// Texte d'un QR code Wi-Fi (format reconnu par les téléphones). Ce QR code ne passe par aucune page : il n'est pas compté.
export function texteWifi({ reseau, cle = '', securite = 'WPA', cache = false }) {
  const echapper = (t) => String(t ?? '').replace(/([\\;,:"])/g, '\\$1');
  const type = ['WPA', 'WEP', 'nopass'].includes(securite) ? securite : 'WPA';
  return `WIFI:T:${type};S:${echapper(reseau)};${type === 'nopass' ? '' : `P:${echapper(cle)};`}${cache ? 'H:true;' : ''};`;
}

// Lien web accepté : adresse complète en http(s).
export function lienValide(url) {
  return /^https?:\/\/[^\s/?#.][^\s]*$/i.test(String(url ?? '').trim());
}

export const emailValide = (adresse) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(adresse ?? '').trim());

// Balises UTM (Google Analytics) : source « qr », support « qr_code », campagne = nom du QR code.
// Celles déjà présentes dans le lien sont gardées.
export function ajouterUtm(url, campagne) {
  let adresse;
  try {
    adresse = new URL(url);
  } catch {
    return url;
  }
  const valeurs = { utm_source: 'qr', utm_medium: 'qr_code', utm_campaign: String(campagne ?? '').trim() || 'qr' };
  for (const [cle, valeur] of Object.entries(valeurs)) if (!adresse.searchParams.has(cle)) adresse.searchParams.set(cle, valeur);
  return adresse.toString();
}

// Période de validité (dates AAAA-MM-JJ, bornes comprises) : 'avant', 'ouvert' ou 'apres'.
export function fenetreDates(debut, fin, jour) {
  if (debut && jour < debut) return 'avant';
  if (fin && jour > fin) return 'apres';
  return 'ouvert';
}

// Où envoyer le client après le scan (réponse de ouvrir_qr_code).
export function destinationQr(r, origine = origineCourante()) {
  const c = r?.contenu ?? {};
  switch (r?.type) {
    case 'lien':
    case 'avis':
      return r.utm ? ajouterUtm(r.cible, r.nom) : r.cible;
    case 'whatsapp': return lienWhatsapp(c.numero, c.message);
    case 'telephone': return lienTelephone(c.numero);
    case 'sms': return lienSms(c.numero, c.message);
    case 'email': return lienEmail(c.adresse, c.sujet, c.message);
    case 'menu': return r.menu ? lienMenu(r.menu, origine) : null;
    default: return null;
  }
}

// Type d'appareil, déduit de l'agent du navigateur (rien n'est envoyé d'autre).
export function typeAppareil(agent = '', pointsTactiles = 0) {
  const ua = String(agent ?? '');
  if (!ua) return 'inconnu';
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/i.test(ua) && pointsTactiles > 1)) return 'tablette';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  return 'ordinateur';
}

// Identifiant tiré au hasard, gardé dans ce navigateur : un même téléphone n'est compté qu'une fois par 30 minutes.
// Aucune information sur la personne ; null en navigation privée stricte.
export function identifiantVisiteur(stockage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const existant = stockage?.getItem('ae-qr-visiteur');
    if (/^[a-f0-9]{32}$/.test(existant ?? '')) return existant;
    const octets = new Uint8Array(16);
    globalThis.crypto.getRandomValues(octets);
    const id = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
    stockage?.setItem('ae-qr-visiteur', id);
    return id;
  } catch {
    return null;
  }
}
