import qrcode from 'qrcode-generator';

// QR codes fabriqués dans le navigateur (aucun service extérieur), avec un style au choix comme les meilleurs
// générateurs : forme des modules (carré, arrondi, points), forme des yeux (carré, arrondi, cercle), couleurs, dégradé,
// fond (ou transparent), marge, cadre avec un appel à l'action, logo facultatif au centre.
// Avec un logo, la correction d'erreur passe au niveau le plus fort (« H » : jusqu'à 30 % du code peut manquer) et le
// logo ne couvre qu'environ 22 % de la largeur, jamais les trois yeux (carrés de repérage des coins).
// Un même « plan » (formes géométriques) sert au SVG, au PNG (canvas) et aux tests (lecture par jsQR).

export const PART_LOGO = 0.22;
export const FORMES_MODULES = { carre: 'Carrés', arrondi: 'Arrondis', points: 'Points' };
export const FORMES_YEUX = { carre: 'Carrés', arrondi: 'Arrondis', cercle: 'Ronds' };
export const CADRES = { aucun: 'Aucun', scannez: 'Scannez-moi', menu: 'Voir le menu', avis: 'Laissez un avis', perso: 'Texte libre' };

// Grille du QR code : taille (en modules) et case noire ou blanche.
export function matriceQr(texte, niveau = 'M') {
  const qr = qrcode(0, niveau);
  qr.addData(String(texte));
  qr.make();
  const taille = qr.getModuleCount();
  return { taille, sombre: (ligne, colonne) => qr.isDark(ligne, colonne) };
}

// Niveau de correction automatique : H avec un logo, M sinon.
export const niveauCorrection = (logo) => (logo ? 'H' : 'M');

// Carré du logo, en modules : centré, de même parité que le code pour tomber juste sur la grille.
export function zoneLogo(taille, part = PART_LOGO) {
  let cote = Math.round(taille * part);
  if ((taille - cote) % 2) cote += (cote + 1) / taille <= 0.25 ? 1 : -1;
  cote = Math.max(cote, 0);
  return { debut: (taille - cote) / 2, cote };
}

// Le logo reste hors des yeux (7 modules + 1 de séparation dans trois coins) et sous 25 % de la largeur.
export function logoSansDanger(taille, zone = zoneLogo(taille)) {
  const fin = zone.debut + zone.cote;
  const reperes = [[0, 0], [0, taille - 8], [taille - 8, 0]];
  const chevauche = reperes.some(([l, c]) => zone.debut < l + 8 && fin > l && zone.debut < c + 8 && fin > c);
  return zone.cote / taille <= 0.25 && !chevauche;
}

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------
// « #1F4FD8 » ou « #14d » → [r, g, b] ; null si illisible.
export function couleurRvb(couleur) {
  const t = String(couleur ?? '').trim().replace(/^#/, '');
  const plein = /^[0-9a-f]{3}$/i.test(t) ? t.split('').map((c) => c + c).join('') : t;
  if (!/^[0-9a-f]{6}$/i.test(plein)) return null;
  return [0, 2, 4].map((i) => parseInt(plein.slice(i, i + 2), 16));
}

const hex = (couleur) => {
  const rvb = couleurRvb(couleur);
  return rvb && `#${rvb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export function luminance(couleur) {
  const rvb = couleurRvb(couleur);
  if (!rvb) return 1;
  const [r, g, b] = rvb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste entre deux couleurs (règle WCAG) : de 1 (aucun) à 21 (noir sur blanc).
export function contraste(a, b = '#ffffff') {
  if (!couleurRvb(a) || !couleurRvb(b)) return 1;
  const [clair, fonce] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (clair + 0.05) / (fonce + 0.05);
}

// Couleur de l'établissement utilisable pour un QR code : si elle se lit bien sur blanc (≥ 4,5), sinon noir.
export function couleurQr(couleur) {
  return hex(couleur) && contraste(couleur) >= 4.5 ? hex(couleur) : '#000000';
}

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------
export const STYLE_DEFAUT = {
  modules: 'carre', yeux: 'carre', couleur: '#000000', couleurYeux: '', degrade: '', fond: '#ffffff', marge: 2,
  cadre: 'aucun', texteCadre: '', couleurCadre: '#000000',
};

// Style nettoyé : toute valeur inconnue reprend la valeur par défaut (rien d'autre n'entre dans le dessin).
export function normaliserStyle(style = {}) {
  const s = style && typeof style === 'object' ? style : {};
  const marge = Number.parseInt(s.marge, 10);
  return {
    modules: FORMES_MODULES[s.modules] ? s.modules : 'carre',
    yeux: FORMES_YEUX[s.yeux] ? s.yeux : 'carre',
    couleur: hex(s.couleur) ?? '#000000',
    couleurYeux: hex(s.couleurYeux) ?? '',
    degrade: hex(s.degrade) ?? '',
    fond: s.fond === 'transparent' ? 'transparent' : hex(s.fond) ?? '#ffffff',
    marge: Number.isFinite(marge) ? Math.min(Math.max(marge, 0), 8) : 2,
    cadre: CADRES[s.cadre] ? s.cadre : 'aucun',
    texteCadre: String(s.texteCadre ?? '').trim().slice(0, 30),
    couleurCadre: hex(s.couleurCadre) ?? '#000000',
  };
}

// Texte du cadre (appel à l'action).
export function texteCadre(style) {
  const s = normaliserStyle(style);
  if (s.cadre === 'perso') return s.texteCadre || CADRES.scannez;
  return s.cadre === 'aucun' ? '' : CADRES[s.cadre];
}

// Lisibilité, avant tout téléchargement. grave = le téléphone risque de ne pas lire : le téléchargement est bloqué.
export function verifierLisibilite(style, { logo = false, taille = 33 } = {}) {
  const s = normaliserStyle(style);
  const fond = s.fond === 'transparent' ? '#ffffff' : s.fond;
  const problemes = [];
  const ajouter = (grave, texte) => { if (!problemes.some((p) => p.texte === texte)) problemes.push({ grave, texte }); };
  if (s.fond === 'transparent') ajouter(false, 'Fond transparent : posez le QR code sur un fond clair et uni.');
  const couleurs = [[s.couleur, 'des modules'], [s.degrade, 'du dégradé'], [s.couleurYeux, 'des yeux']].filter(([c]) => c);
  for (const [c, nom] of couleurs) {
    if (luminance(c) > luminance(fond)) ajouter(true, 'Couleurs inversées (clair sur foncé) : beaucoup de téléphones ne lisent pas ce QR code. Mettez le fond plus clair que les modules.');
    else if (contraste(c, fond) < 3) ajouter(true, `Contraste trop faible entre la couleur ${nom} et le fond : foncez la couleur ou éclaircissez le fond.`);
    else if (contraste(c, fond) < 4.5) ajouter(false, `Contraste moyen pour la couleur ${nom} : imprimez un essai et scannez-le.`);
  }
  if (s.marge < 1 && s.cadre !== 'aucun') ajouter(true, 'Marge trop petite avec un cadre : le cadre touche le QR code. Mettez une marge d’au moins 1.');
  else if (s.marge < 1) ajouter(false, 'Sans marge : laissez un bord blanc autour du QR code à l’impression.');
  if (logo && !logoSansDanger(taille)) ajouter(true, 'Logo trop grand : il cache une partie du QR code.');
  return { lisible: !problemes.some((p) => p.grave), problemes };
}

// ---------------------------------------------------------------------------
// Plan du dessin (formes géométriques en unités de modules)
// ---------------------------------------------------------------------------
const rect = (x, y, l, h, r = 0) => ({ type: 'rect', x, y, l, h, r: Math.min(r, l / 2, h / 2) });
const cercle = (cx, cy, r) => ({ type: 'cercle', cx, cy, r });

// Un œil : anneau 7 × 7 (forme extérieure + trou 5 × 5) et centre 3 × 3.
function oeil(x, y, forme) {
  if (forme === 'cercle') return [cercle(x + 3.5, y + 3.5, 3.5), cercle(x + 3.5, y + 3.5, 2.5), cercle(x + 3.5, y + 3.5, 1.5)];
  const r = forme === 'arrondi' ? [2, 1.4, 0.9] : [0, 0, 0];
  return [rect(x, y, 7, 7, r[0]), rect(x + 1, y + 1, 5, 5, r[1]), rect(x + 2, y + 2, 3, 3, r[2])];
}

// Centres des motifs d'alignement (norme QR, versions 2 à 40). Ils restent carrés quel que soit le style : les lecteurs
// (jsQR, appareils photo) les cherchent pleins ; en points, le code ne se lisait plus.
const ALIGNEMENTS = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82],
  [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]];

export function centresAlignement(taille) {
  const positions = ALIGNEMENTS[(taille - 17) / 4] ?? [];
  const fin = taille - 7;
  return positions.flatMap((l) => positions.map((c) => [l, c]))
    .filter(([l, c]) => !((l < 9 && c < 9) || (l < 9 && c > fin - 2) || (l > fin - 2 && c < 9)));
}

export function planQr(texte, { style = {}, logo = false } = {}) {
  const s = normaliserStyle(style);
  const { taille, sombre } = matriceQr(texte, niveauCorrection(logo));
  const m = s.marge;
  const zone = logo ? zoneLogo(taille) : null;
  const dansZone = (l, c) => zone && l >= zone.debut && l < zone.debut + zone.cote && c >= zone.debut && c < zone.debut + zone.cote;
  const dansOeil = (l, c) => (l < 7 && c < 7) || (l < 7 && c >= taille - 7) || (l >= taille - 7 && c < 7);
  const alignements = centresAlignement(taille);
  const dansAlignement = (l, c) => alignements.some(([al, ac]) => Math.abs(l - al) <= 2 && Math.abs(c - ac) <= 2);
  const modules = [];
  for (let l = 0; l < taille; l += 1) {
    for (let c = 0; c < taille; c += 1) {
      if (!sombre(l, c) || dansOeil(l, c) || dansZone(l, c)) continue;
      if (s.modules !== 'carre' && dansAlignement(l, c)) modules.push(rect(c + m, l + m, 1, 1, 0));
      else if (s.modules === 'points') modules.push(cercle(c + m + 0.5, l + m + 0.5, 0.46));
      else modules.push(rect(c + m, l + m, 1, 1, s.modules === 'arrondi' ? 0.32 : 0));
    }
  }
  const yeux = [[0, 0], [0, taille - 7], [taille - 7, 0]].flatMap(([l, c]) => oeil(c + m, l + m, s.yeux));
  const cote = taille + 2 * m;
  // Cadre : bordure autour du QR code et bandeau du bas avec le texte.
  const texte2 = texteCadre(s);
  const epaisseur = texte2 ? Math.max(1, cote * 0.035) : 0;
  const bande = texte2 ? cote * 0.2 : 0;
  const largeur = cote + 2 * epaisseur;
  const hauteur = cote + 2 * epaisseur + bande;
  const qr = { x: epaisseur, y: epaisseur, cote };
  const decaler = (f) => (f.type === 'rect' ? { ...f, x: f.x + qr.x, y: f.y + qr.y } : { ...f, cx: f.cx + qr.x, cy: f.cy + qr.y });
  let logoPlan = null;
  if (zone) {
    const fond = { x: qr.x + m + zone.debut, y: qr.y + m + zone.debut, cote: zone.cote, rayon: zone.cote * 0.18 };
    const retrait = Math.max(0.6, zone.cote * 0.1);
    logoPlan = { fond, image: { x: fond.x + retrait, y: fond.y + retrait, cote: zone.cote - 2 * retrait } };
  }
  return {
    taille, style: s, largeur, hauteur, qr,
    fond: s.fond === 'transparent' ? null : s.fond,
    modules: { formes: modules.map(decaler), couleur: s.couleur, degrade: s.degrade || null },
    yeux: {
      formes: yeux.map(decaler),
      couleur: s.couleurYeux || s.couleur,
      degrade: s.couleurYeux ? null : s.degrade || null,
    },
    logo: logoPlan,
    cadre: texte2 ? {
      formes: [rect(0, 0, largeur, hauteur, epaisseur * 1.5), rect(qr.x, qr.y, cote, cote, epaisseur * 0.5)],
      couleur: s.couleurCadre,
      texte: texte2,
      couleurTexte: contraste(s.couleurCadre, '#ffffff') >= 3 ? '#ffffff' : '#000000',
      x: largeur / 2, y: cote + 2 * epaisseur + bande / 2 - epaisseur / 2, police: bande * 0.5, largeurMax: largeur * 0.88,
    } : null,
  };
}

// Point dans un calque (règle pair-impair : un anneau = forme extérieure + trou).
export function pointDans(formes, x, y) {
  let n = 0;
  for (const f of formes) {
    if (f.type === 'cercle') {
      if ((x - f.cx) ** 2 + (y - f.cy) ** 2 <= f.r ** 2) n += 1;
    } else if (x >= f.x && x <= f.x + f.l && y >= f.y && y <= f.y + f.h) {
      const cx = Math.min(Math.max(x, f.x + f.r), f.x + f.l - f.r);
      const cy = Math.min(Math.max(y, f.y + f.r), f.y + f.h - f.r);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= f.r ** 2 + 1e-9) n += 1;
    }
  }
  return n % 2 === 1;
}

const nb = (v) => Number(v.toFixed(3));
// Formes → chemin SVG (aussi utilisé par Path2D pour le PNG).
export function cheminFormes(formes) {
  return formes.map((f) => {
    if (f.type === 'cercle') return `M${nb(f.cx - f.r)} ${nb(f.cy)}a${nb(f.r)} ${nb(f.r)} 0 1 0 ${nb(2 * f.r)} 0a${nb(f.r)} ${nb(f.r)} 0 1 0 ${nb(-2 * f.r)} 0z`;
    if (!f.r) return `M${nb(f.x)} ${nb(f.y)}h${nb(f.l)}v${nb(f.h)}h${nb(-f.l)}z`;
    const r = nb(f.r);
    return `M${nb(f.x + f.r)} ${nb(f.y)}h${nb(f.l - 2 * f.r)}a${r} ${r} 0 0 1 ${r} ${r}v${nb(f.h - 2 * f.r)}a${r} ${r} 0 0 1 ${-r} ${r}`
      + `h${nb(2 * f.r - f.l)}a${r} ${r} 0 0 1 ${-r} ${-r}v${nb(2 * f.r - f.h)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  }).join('');
}

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Identifiant court et stable pour le dégradé (plusieurs QR codes sur la même page ne se mélangent pas).
function empreinte(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i += 1) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// Dégradé en diagonale sur la surface du QR code (SVG).
export function svgDegrade(id, de, a, qr) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${nb(qr.x)}" y1="${nb(qr.y)}" x2="${nb(qr.x + qr.cote)}" y2="${nb(qr.y + qr.cote)}">`
    + `<stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
}

// QR code en SVG. logo : adresse data: de préférence, pour un fichier autonome.
export function svgQr(texte, { style = {}, logo = null } = {}) {
  const plan = planQr(texte, { style, logo: Boolean(logo) });
  const id = `qrd${empreinte(`${texte}|${JSON.stringify(plan.style)}`)}`;
  const defs = [];
  const remplissage = (calque, suffixe) => {
    if (!calque.degrade) return calque.couleur;
    defs.push(svgDegrade(`${id}${suffixe}`, calque.couleur, calque.degrade, plan.qr));
    return `url(#${id}${suffixe})`;
  };
  const corps = [];
  if (plan.cadre) corps.push(`<path d="${cheminFormes(plan.cadre.formes)}" fill="${plan.cadre.couleur}" fill-rule="evenodd"/>`);
  if (plan.fond) corps.push(`<rect x="${nb(plan.qr.x)}" y="${nb(plan.qr.y)}" width="${nb(plan.qr.cote)}" height="${nb(plan.qr.cote)}" fill="${plan.fond}"/>`);
  corps.push(`<path d="${cheminFormes(plan.modules.formes)}" fill="${remplissage(plan.modules, 'm')}" fill-rule="evenodd"/>`);
  corps.push(`<path d="${cheminFormes(plan.yeux.formes)}" fill="${remplissage(plan.yeux, 'y')}" fill-rule="evenodd"/>`);
  if (plan.logo) {
    const { fond, image } = plan.logo;
    corps.push(`<rect x="${nb(fond.x)}" y="${nb(fond.y)}" width="${nb(fond.cote)}" height="${nb(fond.cote)}" rx="${nb(fond.rayon)}" fill="${plan.fond ?? '#ffffff'}"/>`);
    corps.push(`<image href="${echapper(logo)}" x="${nb(image.x)}" y="${nb(image.y)}" width="${nb(image.cote)}" height="${nb(image.cote)}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  if (plan.cadre) {
    const c = plan.cadre;
    const long = c.texte.length * c.police * 0.62 > c.largeurMax ? ` textLength="${nb(c.largeurMax)}" lengthAdjust="spacingAndGlyphs"` : '';
    corps.push(`<text x="${nb(c.x)}" y="${nb(c.y)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${nb(c.police)}" fill="${c.couleurTexte}"${long}>${echapper(c.texte)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${nb(plan.largeur)} ${nb(plan.hauteur)}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${corps.join('')}</svg>`;
}

// Tailles de PNG proposées (pixels de large).
export const TAILLES_PNG = [512, 1024, 2048];

// Contenus (liens, Wi-Fi, vCard, UTM…) : voir qrContenus.js.
export * from './qrContenus.js';
