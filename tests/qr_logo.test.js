import jsQR from 'jsqr';
import { describe, expect, test } from 'vitest';
import {
  CADRES, FORMES_MODULES, centresAlignement, FORMES_YEUX, ajouterUtm, cheminFormes, contraste, couleurQr, destinationQr, emailValide, fenetreDates,
  identifiantVisiteur, lienEmail, lienQr, lienSms, lienTelephone, lienValide, lienWhatsapp, logoSansDanger, matriceQr,
  niveauCorrection, normaliserStyle, numeroWhatsapp, planQr, pointDans, svgDegrade, svgQr, texteCadre, texteVcard, texteWifi,
  typeAppareil, verifierLisibilite, zoneLogo,
} from '../src/noyau/qr.js';

// QR codes : styles (modules, yeux, couleurs, dégradé, cadre, logo), lisibilité, et surtout le code imprimé se lit
// encore : chaque combinaison est dessinée en pixels à partir du même plan que l'écran, puis décodée par jsQR
// (sans essai « couleurs inversées », comme beaucoup de téléphones).

const rvb = (h) => h.match(/\w\w/g).map((x) => parseInt(x, 16));

// Dessin en pixels : chaque calque est rempli en pair-impair (anneaux des yeux et du cadre), comme le SVG.
function pixels(plan, { echelle = 8, bruitLogo = true } = {}) {
  const l = Math.ceil(plan.largeur * echelle);
  const h = Math.ceil(plan.hauteur * echelle);
  const data = new Uint8ClampedArray(l * h * 4).fill(255);
  const calque = (formes, couleur) => {
    const compte = new Uint8Array(l * h);
    for (const f of formes) {
      const [x0, y0, x1, y1] = f.type === 'cercle' ? [f.cx - f.r, f.cy - f.r, f.cx + f.r, f.cy + f.r] : [f.x, f.y, f.x + f.l, f.y + f.h];
      for (let y = Math.max(0, Math.floor(y0 * echelle)); y < Math.min(h, Math.ceil(y1 * echelle)); y += 1) {
        for (let x = Math.max(0, Math.floor(x0 * echelle)); x < Math.min(l, Math.ceil(x1 * echelle)); x += 1) {
          if (pointDans([f], (x + 0.5) / echelle, (y + 0.5) / echelle)) compte[y * l + x] += 1;
        }
      }
    }
    for (let i = 0; i < l * h; i += 1) if (compte[i] % 2) [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]] = couleur;
  };
  const carre = (x0, y0, cote, couleur) => {
    for (let y = Math.floor(y0 * echelle); y < Math.ceil((y0 + cote) * echelle); y += 1) {
      for (let x = Math.floor(x0 * echelle); x < Math.ceil((x0 + cote) * echelle); x += 1) {
        const i = (y * l + x) * 4;
        [data[i], data[i + 1], data[i + 2]] = typeof couleur === 'function' ? couleur(x, y) : couleur;
      }
    }
  };
  if (plan.cadre) calque(plan.cadre.formes, rvb(plan.cadre.couleur));
  carre(plan.qr.x, plan.qr.y, plan.qr.cote, plan.fond ? rvb(plan.fond) : [255, 255, 255]);
  calque(plan.modules.formes, rvb(plan.modules.couleur));
  calque(plan.yeux.formes, rvb(plan.yeux.couleur));
  if (plan.logo) {
    carre(plan.logo.fond.x, plan.logo.fond.y, plan.logo.fond.cote, [255, 255, 255]);
    if (bruitLogo) carre(plan.logo.image.x, plan.logo.image.y, plan.logo.image.cote, (x, y) => (((x >> 2) + (y >> 2)) % 2 ? [20, 30, 200] : [240, 180, 0]));
  }
  return { data, l, h };
}

const lire = (plan) => {
  const { data, l, h } = pixels(plan);
  return jsQR(data, l, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
};

const TEXTES = [
  lienQr('0123456789abcdef0123', 'https://commerce-demo.agence-elite.fr/'),
  `https://exemple.test/${'a'.repeat(150)}`,
];

describe('lecture du QR code (jsQR)', () => {
  const combinaisons = [];
  for (const modules of Object.keys(FORMES_MODULES)) {
    for (const yeux of Object.keys(FORMES_YEUX)) {
      for (const logo of [false, true]) combinaisons.push([modules, yeux, logo]);
    }
  }
  test.each(combinaisons)('modules %s, yeux %s, logo %s : se lit', (modules, yeux, logo) => {
    for (const texte of TEXTES) {
      const style = { modules, yeux, couleur: '#1f4fd8', couleurYeux: '#0b2a7a', degrade: '#5a1fb8', cadre: 'scannez', couleurCadre: '#1f4fd8' };
      expect(lire(planQr(texte, { style, logo }))).toBe(texte);
      expect(lire(planQr(texte, { style: { modules, yeux }, logo }))).toBe(texte);
    }
  });
  test('marges, fond coloré clair, cadre au texte libre : se lit', () => {
    const texte = TEXTES[0];
    for (const marge of [1, 2, 4, 8]) expect(lire(planQr(texte, { style: { marge, cadre: 'perso', texteCadre: 'Votre avis compte' } }))).toBe(texte);
    expect(lire(planQr(texte, { style: { fond: '#fff4d6', couleur: '#3a2200' }, logo: true }))).toBe(texte);
  });
  test('couleurs inversées : illisible, et la vérification le signale', () => {
    const style = { couleur: '#ffffff', fond: '#000000' };
    expect(lire(planQr(TEXTES[0], { style }))).not.toBe(TEXTES[0]);
    expect(verifierLisibilite(style).lisible).toBe(false);
  });
  test('correction H avec logo, M sans', () => {
    expect(niveauCorrection(true)).toBe('H');
    expect(niveauCorrection(false)).toBe('M');
    expect(planQr(TEXTES[0], { logo: true }).taille).toBe(matriceQr(TEXTES[0], 'H').taille);
    expect(planQr(TEXTES[0]).taille).toBe(matriceQr(TEXTES[0], 'M').taille);
  });
});

describe('plan et géométrie', () => {
  test.each([21, 25, 29, 33, 41, 57, 77, 101, 177])('logo, taille %i : centré, ≤ 25 %, hors des yeux', (taille) => {
    const z = zoneLogo(taille);
    expect(z.cote / taille).toBeLessThanOrEqual(0.25);
    expect(z.cote / taille).toBeGreaterThan(0.15);
    expect(z.debut * 2 + z.cote).toBe(taille);
    expect(Number.isInteger(z.debut)).toBe(true);
    expect(logoSansDanger(taille, z)).toBe(true);
  });
  test('un logo trop grand ou dans un coin est refusé', () => {
    expect(logoSansDanger(33, { debut: 3, cote: 27 })).toBe(false);
    expect(logoSansDanger(33, { debut: 0, cote: 6 })).toBe(false);
  });
  test('yeux : trois anneaux et trois centres, aucun module sous le logo', () => {
    const plan = planQr(TEXTES[0], { logo: true, style: { yeux: 'cercle' } });
    expect(plan.yeux.formes).toHaveLength(9);
    expect(plan.yeux.formes.every((f) => f.type === 'cercle')).toBe(true);
    const { fond } = plan.logo;
    expect(plan.modules.formes.some((f) => f.x >= fond.x && f.x < fond.x + fond.cote && f.y >= fond.y && f.y < fond.y + fond.cote)).toBe(false);
    // Points et arrondis, sauf les motifs d'alignement (5 × 5, gardés carrés : sinon le code ne se lit plus).
    const points = planQr(TEXTES[0], { style: { modules: 'points' } });
    const carres = points.modules.formes.filter((f) => f.type === 'rect');
    expect(centresAlignement(points.taille)).toEqual([[points.taille - 7, points.taille - 7]]);
    expect(carres.length).toBe(17);
    expect(points.modules.formes.filter((f) => f.type === 'cercle').every((f) => f.r < 0.5)).toBe(true);
    expect(planQr(TEXTES[0], { style: { modules: 'arrondi' } }).modules.formes.filter((f) => f.r > 0).length).toBeGreaterThan(100);
    expect(centresAlignement(21)).toEqual([]);
    expect(centresAlignement(45)).toHaveLength(6);
  });
  test('cadre : plus haut que large (bandeau du texte), texte lisible sur sa couleur', () => {
    const sans = planQr('x');
    expect(sans.cadre).toBeNull();
    expect(sans.largeur).toBe(sans.hauteur);
    const avec = planQr('x', { style: { cadre: 'avis', couleurCadre: '#ffe600' } });
    expect(avec.hauteur).toBeGreaterThan(avec.largeur);
    expect(avec.cadre).toMatchObject({ texte: 'Laissez un avis', couleurTexte: '#000000' });
    expect(planQr('x', { style: { cadre: 'menu', couleurCadre: '#1f4fd8' } }).cadre.couleurTexte).toBe('#ffffff');
  });
  test('point dans un anneau (pair-impair)', () => {
    const anneau = [{ type: 'rect', x: 0, y: 0, l: 7, h: 7, r: 0 }, { type: 'rect', x: 1, y: 1, l: 5, h: 5, r: 0 }];
    expect(pointDans(anneau, 0.5, 0.5)).toBe(true);
    expect(pointDans(anneau, 3.5, 3.5)).toBe(false);
    expect(pointDans([{ type: 'rect', x: 0, y: 0, l: 2, h: 2, r: 1 }], 0.05, 0.05)).toBe(false);
    expect(pointDans([{ type: 'cercle', cx: 1, cy: 1, r: 1 }], 1, 1.9)).toBe(true);
  });
  test('chemins SVG', () => {
    expect(cheminFormes([{ type: 'rect', x: 1, y: 2, l: 1, h: 1, r: 0 }])).toBe('M1 2h1v1h-1z');
    expect(cheminFormes([{ type: 'cercle', cx: 1.5, cy: 1.5, r: 0.5 }])).toBe('M1 1.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z');
    expect(cheminFormes([{ type: 'rect', x: 0, y: 0, l: 2, h: 2, r: 0.5 }])).toContain('a0.5 0.5 0 0 1');
  });
});

describe('SVG', () => {
  test('logo, couleurs, dégradé, fond transparent, cadre', () => {
    const svg = svgQr('https://exemple.test', {
      logo: 'data:image/png;base64,AAAA',
      style: { couleur: '#1F4FD8', degrade: '#7a1fd8', couleurYeux: '#000', fond: 'transparent', cadre: 'perso', texteCadre: 'Menu & <boissons>' },
    });
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
    expect(svg).toMatch(/<linearGradient id="qrd\w+m"/);
    expect(svg).toContain('stop-color="#1f4fd8"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#/);
    expect(svg).toContain('Menu &amp; &lt;boissons&gt;');
    expect(svg).not.toContain('<boissons>');
  });
  test('dégradé : identifiants différents pour deux QR codes', () => {
    const a = svgQr('a', { style: { degrade: '#7a1fd8' } }).match(/id="(qrd\w+)"/)[1];
    const b = svgQr('b', { style: { degrade: '#7a1fd8' } }).match(/id="(qrd\w+)"/)[1];
    expect(a).not.toBe(b);
    expect(svgDegrade('g', '#000000', '#111111', { x: 1, y: 1, cote: 10 })).toBe(
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="1" y1="1" x2="11" y2="11"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#111111"/></linearGradient>',
    );
  });
  test('valeurs étrangères refusées (rien d’injecté dans le dessin)', () => {
    const svg = svgQr('x', { logo: 'data:image/png;base64,"><script>', style: { couleur: 'red"/><script>', fond: 'url(javascript:1)', modules: 'etoile' } });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('fill="#000000"');
    expect(normaliserStyle({ modules: 'etoile', marge: 99, cadre: 'pub', texteCadre: 'x'.repeat(50) })).toMatchObject({ modules: 'carre', marge: 8, cadre: 'aucun' });
    expect(normaliserStyle({ texteCadre: 'x'.repeat(50) }).texteCadre).toHaveLength(30);
    expect(normaliserStyle(null)).toMatchObject({ couleur: '#000000', fond: '#ffffff', marge: 2 });
  });
});

describe('lisibilité et contraste', () => {
  test('contraste WCAG ; couleur de l’établissement trop claire : noir', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#ffffff')).toBeCloseTo(1, 5);
    expect(contraste('pas une couleur')).toBe(1);
    expect(couleurQr('#1F4FD8')).toBe('#1f4fd8');
    expect(couleurQr('#F5C400')).toBe('#000000');
    expect(couleurQr(null)).toBe('#000000');
  });
  test('vérification avant téléchargement', () => {
    expect(verifierLisibilite({})).toEqual({ lisible: true, problemes: [] });
    expect(verifierLisibilite({ couleur: '#dddddd' }).problemes[0]).toMatchObject({ grave: true, texte: expect.stringMatching(/Contraste trop faible/) });
    expect(verifierLisibilite({ couleur: '#888888' }).problemes[0]).toMatchObject({ grave: false, texte: expect.stringMatching(/Contraste moyen/) });
    expect(verifierLisibilite({ couleur: '#ffffff', fond: '#1f4fd8' }).problemes[0].texte).toMatch(/Couleurs inversées/);
    expect(verifierLisibilite({ degrade: '#f0f0f0' }).lisible).toBe(false);
    expect(verifierLisibilite({ couleurYeux: '#eeeeee' }).lisible).toBe(false);
    expect(verifierLisibilite({ fond: 'transparent' })).toMatchObject({ lisible: true, problemes: [{ grave: false }] });
    expect(verifierLisibilite({ marge: 0, cadre: 'scannez' }).lisible).toBe(false);
    expect(verifierLisibilite({ marge: 0 }).lisible).toBe(true);
    expect(verifierLisibilite({}, { logo: true, taille: 33 }).lisible).toBe(true);
  });
  test('texte du cadre', () => {
    expect(texteCadre({})).toBe('');
    expect(texteCadre({ cadre: 'scannez' })).toBe('Scannez-moi');
    expect(texteCadre({ cadre: 'menu' })).toBe('Voir le menu');
    expect(texteCadre({ cadre: 'avis' })).toBe('Laissez un avis');
    expect(texteCadre({ cadre: 'perso', texteCadre: '  Wi-Fi gratuit ' })).toBe('Wi-Fi gratuit');
    expect(texteCadre({ cadre: 'perso' })).toBe('Scannez-moi');
    expect(Object.keys(CADRES)).toEqual(['aucun', 'scannez', 'menu', 'avis', 'perso']);
  });
});

describe('contenus', () => {
  test('WhatsApp, appel, SMS, e-mail', () => {
    expect(numeroWhatsapp('+242 06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsapp('00242061234567')).toBe('242061234567');
    expect(lienWhatsapp('+242 06 123 45 67')).toBe('https://wa.me/242061234567');
    expect(lienWhatsapp('242061234567', 'Bonjour, une table & 2 cafés ?')).toBe('https://wa.me/242061234567?text=Bonjour%2C%20une%20table%20%26%202%20caf%C3%A9s%20%3F');
    expect(lienTelephone('+242 06 000 00 01')).toBe('tel:+242060000001');
    expect(lienSms('242060000001', 'Réserver')).toBe('sms:+242060000001?body=R%C3%A9server');
    expect(lienSms('242060000001')).toBe('sms:+242060000001');
    expect(lienEmail('a@b.test', 'Devis', 'Bonjour & merci')).toBe('mailto:a@b.test?subject=Devis&body=Bonjour%20%26%20merci');
    expect(lienEmail('a@b.test')).toBe('mailto:a@b.test');
    expect(emailValide('a@b.test')).toBe(true);
    expect(emailValide('a@b')).toBe(false);
  });
  test('fiche contact (vCard)', () => {
    const v = texteVcard({ prenom: 'Awa', nom: 'Diallo', societe: 'Bar; Plage', telephone: '+242 06 000 00 02', email: 'awa@exemple.test', site: 'https://exemple.test', adresse: 'Av. de la Paix, Pointe-Noire' });
    expect(v.split('\r\n')).toEqual([
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Diallo;Awa;;;', 'FN:Awa Diallo', 'ORG:Bar\\; Plage', 'TEL;TYPE=CELL:+242060000002',
      'EMAIL:awa@exemple.test', 'URL:https://exemple.test', 'ADR;TYPE=WORK:;;Av. de la Paix\\, Pointe-Noire;;;;', 'END:VCARD',
    ]);
    expect(texteVcard({ societe: 'Bar Démo' })).toContain('FN:Bar Démo');
  });
  test('Wi-Fi', () => {
    expect(texteWifi({ reseau: 'Invites', cle: 'motdepasse1' })).toBe('WIFI:T:WPA;S:Invites;P:motdepasse1;;');
    expect(texteWifi({ reseau: 'Bar;Plage', cle: 'a:b"c\\d', securite: 'WPA' })).toBe('WIFI:T:WPA;S:Bar\\;Plage;P:a\\:b\\"c\\\\d;;');
    expect(texteWifi({ reseau: 'Libre', securite: 'nopass' })).toBe('WIFI:T:nopass;S:Libre;;');
    expect(texteWifi({ reseau: 'X', cle: '12345678', cache: true })).toBe('WIFI:T:WPA;S:X;P:12345678;H:true;;');
  });
  test('liens et UTM', () => {
    expect(lienValide('https://instagram.com/commerce.demo')).toBe(true);
    expect(lienValide('javascript:alert(1)')).toBe(false);
    expect(lienValide('instagram.com')).toBe(false);
    expect(lienValide('https://')).toBe(false);
    expect(lienQr('abc', 'https://x.test/')).toBe('https://x.test/#/q/abc');
    expect(ajouterUtm('https://exemple.test/page', 'Flyer entrée')).toBe('https://exemple.test/page?utm_source=qr&utm_medium=qr_code&utm_campaign=Flyer+entr%C3%A9e');
    expect(ajouterUtm('https://exemple.test/?a=1&utm_source=insta#haut', 'X')).toBe('https://exemple.test/?a=1&utm_source=insta&utm_medium=qr_code&utm_campaign=X#haut');
    expect(ajouterUtm('pas une adresse', 'X')).toBe('pas une adresse');
  });
  test('période de validité', () => {
    expect(fenetreDates(null, null, '2026-10-17')).toBe('ouvert');
    expect(fenetreDates('2026-10-18', null, '2026-10-17')).toBe('avant');
    expect(fenetreDates('2026-10-17', '2026-10-17', '2026-10-17')).toBe('ouvert');
    expect(fenetreDates(null, '2026-10-16', '2026-10-17')).toBe('apres');
  });
  test('destination après le scan', () => {
    const o = 'https://x.test/';
    expect(destinationQr({ type: 'lien', cible: 'https://a.test/', nom: 'Flyer', utm: true }, o)).toBe('https://a.test/?utm_source=qr&utm_medium=qr_code&utm_campaign=Flyer');
    expect(destinationQr({ type: 'avis', cible: 'https://g.test/r', utm: false }, o)).toBe('https://g.test/r');
    expect(destinationQr({ type: 'whatsapp', contenu: { numero: '242061234567', message: 'Bonjour' } }, o)).toBe('https://wa.me/242061234567?text=Bonjour');
    expect(destinationQr({ type: 'telephone', contenu: { numero: '242060000001' } }, o)).toBe('tel:+242060000001');
    expect(destinationQr({ type: 'sms', contenu: { numero: '242060000001' } }, o)).toBe('sms:+242060000001');
    expect(destinationQr({ type: 'email', contenu: { adresse: 'a@b.test' } }, o)).toBe('mailto:a@b.test');
    expect(destinationQr({ type: 'menu', menu: 'abc' }, o)).toBe('https://x.test/#/menu/abc');
    expect(destinationQr({ type: 'vcard', contenu: { prenom: 'A' } }, o)).toBeNull();
  });
  test('type d’appareil', () => {
    expect(typeAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(typeAppareil('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36')).toBe('mobile');
    expect(typeAppareil('Mozilla/5.0 (Linux; Android 13; SM-X200) Chrome/120 Safari/537.36')).toBe('tablette');
    expect(typeAppareil('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('tablette');
    expect(typeAppareil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('tablette');
    expect(typeAppareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('ordinateur');
    expect(typeAppareil('')).toBe('inconnu');
  });
  test('identifiant du navigateur : tiré une fois, gardé', () => {
    const memoire = new Map();
    const stockage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
    const id = identifiantVisiteur(stockage);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(identifiantVisiteur(stockage)).toBe(id);
    expect(identifiantVisiteur({ getItem: () => { throw new Error('bloqué'); } })).toBeNull();
  });
});
