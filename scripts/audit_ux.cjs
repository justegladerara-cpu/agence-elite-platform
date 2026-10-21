// Audit de lisibilité de l'interface (Elite UX 2.0, docs/UX_AUDIT.md). Démo locale uniquement (données fictives) :
//   npm run build:demo && npx vite preview --port 4173
//   CHROMIUM_PATH=… node scripts/audit_ux.cjs [fichier.json] [dossier-captures]
// Chaque profil de la démo ouvre chaque page de son menu sur téléphone, tablette et ordinateur. Aucune écriture.
// Mesures par écran : débordement de la page, éléments sortis de l'écran, montants coupés, petites cibles tactiles,
// textes peu contrastés (calcul WCAG sur les couleurs calculées), temps d'affichage. Puis un test de résistance des
// montants : les valeurs des cartes chiffrées du tableau de bord sont remplacées par des montants longs.
// Variables : URL_APP, PROFILS (ex. "0,1" : indices des profils), FORMATS (ex. "telephone,ordinateur").
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const SORTIE = process.argv[2] ?? 'captures-parcours/audit_ux.json';
// Captures de tous les écrans audités : CAPTURES_TOUTES=oui (sinon seulement celles des montants longs).
const CAPTURES = process.argv[3] ?? null;
const TOUS_FORMATS = {
  telephone: { width: 390, height: 844 },
  tablette: { width: 820, height: 1180 },
  ordinateur: { width: 1366, height: 820 },
};
const FORMATS = (process.env.FORMATS ?? 'telephone,tablette,ordinateur').split(',').map((f) => [f, TOUS_FORMATS[f]]);
const ROUTES = Object.fromEntries(fs.readdirSync(path.join(__dirname, '../src/modules'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(__dirname, '../src/modules', d.name)).filter((f) => /^manifeste.*\.js$/.test(f)).map((f) => path.join(__dirname, '../src/modules', d.name, f)))
  .flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/id: '([^']+)', libelle: '([^']+)'/g)].map((m) => [m[2], m[1]])));
const LARGEURS_MONTANTS = [320, 375, 390, 430, 768, 1024, 1366, 1440, 1920];
const MONTANTS = ['0 FCFA', '500 FCFA', '25 000 FCFA', '1 250 000 FCFA', '125 750 000 FCFA', '3 456 789 012 FCFA'];

async function attendreAffichage(p) {
  const debut = Date.now();
  while (Date.now() - debut < 10000) {
    const enCours = await p.evaluate(() => Boolean(
      document.querySelector('main .squelette, main .chargement') || /Chargement…|Préparation de la base…/.test(document.querySelector('main')?.innerText ?? '')
    ));
    if (!enCours) break;
    await p.waitForTimeout(100);
  }
  // Puis le contenu stable (données arrivées) : même texte pendant 500 ms, 6 s au plus.
  let avant = '';
  const fin = Date.now() + 6000;
  while (Date.now() < fin) {
    const texte = await p.evaluate(() => document.querySelector('main')?.innerText ?? '');
    if (texte === avant) break;
    avant = texte;
    await p.waitForTimeout(500);
  }
  return Date.now() - debut;
}

// Mesures faites dans la page. Contraste : couleur du texte contre le premier fond opaque des parents.
function mesurer() {
  const largeur = window.innerWidth;
  const main = document.querySelector('main') ?? document.body;
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= largeur) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  // Les conteneurs qui défilent exprès (tableau large, bande de cartes) ne comptent pas ; la zone de contenu
  // elle-même (main) défile en hauteur seulement : ce qui sort de sa largeur est un débordement.
  const dansDefilement = (e) => {
    for (let x = e.parentElement; x && x !== main && x !== document.body; x = x.parentElement) {
      const o = getComputedStyle(x).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const description = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
  const elements = [...main.querySelectorAll('*')].filter(visible);
  const horsEcran = elements.filter((e) => e.getBoundingClientRect().right > largeur + 1 && !dansDefilement(e));
  // Contenu coupé dans un conteneur qui défile ou masque : seulement pour les montants et chiffres clés.
  const montant = /\d[\d\s  ]*([,.]\d+)?\s?(FCFA|XAF|F CFA|€|k|M|Md)?/;
  const coupes = elements.filter((e) => {
    if (e.children.length > 2) return false;
    const t = e.innerText?.trim() ?? '';
    if (!t || t.length > 40 || !montant.test(t) || !/\d{3}/.test(t.replace(/\s| | /g, ''))) return false;
    const s = getComputedStyle(e);
    const coupe = (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1;
    return coupe;
  });
  const interactifs = [...document.querySelectorAll('main button, main a[href], main input:not([type=hidden]), main select, main [role=button], header button, aside button')]
    .filter(visible)
    .filter((e) => !(e.tagName === 'A' && e.closest('p, li, td, dd')))
    .filter((e) => !(e.tagName === 'INPUT' && ['checkbox', 'radio'].includes(e.type)));
  const petites = interactifs.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.height < 40 - 0.5 || r.width < 40 - 0.5;
  });
  const tresPetites = interactifs.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.height < 24 || r.width < 24;
  });
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const fond = (e) => {
    for (let x = e; x; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgb(s.backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return rgb(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255 };
  };
  const contrasteFaible = [];
  const zones = [...document.querySelectorAll('main *, header.barre-haut *, aside.menu *')].filter(visible);
  for (const e of zones) {
    const texte = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!texte) continue;
    if (e.closest('[disabled], [aria-disabled=true], .desactive')) continue;
    const s = getComputedStyle(e);
    const c = rgb(s.color);
    const f = fond(e);
    if (!c || !f) continue;
    const l1 = lum(c);
    const l2 = lum(f);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const taille = parseFloat(s.fontSize);
    const grand = taille >= 24 || (taille >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (grand ? 3 : 4.5)) contrasteFaible.push(`${description(e)} « ${texte.slice(0, 30)} » ${ratio.toFixed(2)}`);
  }
  const petitTexte = zones.filter((e) => {
    const texte = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    return texte && parseFloat(getComputedStyle(e).fontSize) < 12;
  }).length;
  return {
    titre: document.querySelector('main h1')?.innerText ?? '',
    debordement_page: document.documentElement.scrollWidth > largeur + 1 || main.scrollWidth > main.clientWidth + 1,
    largeur_contenu: document.documentElement.scrollWidth,
    hors_ecran: horsEcran.length,
    hors_ecran_exemples: [...new Set(horsEcran.slice(0, 40).map(description))].slice(0, 6),
    montants_coupes: coupes.length,
    montants_coupes_exemples: coupes.slice(0, 4).map((e) => `${description(e)} « ${e.innerText.trim().slice(0, 30)} »`),
    cibles: interactifs.length,
    petites_cibles: petites.length,
    tres_petites_cibles: tresPetites.length,
    contraste_faible: contrasteFaible.length,
    contraste_exemples: contrasteFaible.slice(0, 5),
    petit_texte: petitTexte,
    erreur_affichee: main.querySelector('.erreur')?.innerText.slice(0, 160) ?? '',
  };
}

// Montants longs injectés dans les cartes chiffrées : la valeur est-elle entièrement visible ?
function resisterMontants(montant) {
  const largeur = window.innerWidth;
  const main = document.querySelector('main');
  const valeurs = [...document.querySelectorAll('main .kpi-valeur, main .stat-card-valeur, main .indicateur strong, main .ds-kpi-valeur, main .kpi-domaine-valeur')];
  let coupees = 0;
  let horsCarte = 0;
  for (const v of valeurs) {
    const cible = v.querySelector('[data-montant]') ?? v;
    cible.textContent = montant;
  }
  for (const v of valeurs) {
    const r = v.getBoundingClientRect();
    if (r.width === 0) continue;
    const s = getComputedStyle(v);
    if ((s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.overflowX === 'hidden') && v.scrollWidth > v.clientWidth + 1) coupees += 1;
    const carte = v.closest('.stat-card, .kpi, .indicateur, .ds-kpi, .carte, section') ?? v.parentElement;
    const rc = carte.getBoundingClientRect();
    if (r.right > rc.right + 1 || r.right > window.innerWidth + 1 || v.scrollWidth > rc.width + 1) horsCarte += 1;
  }
  return { cartes: valeurs.length, coupees, hors_carte: horsCarte, debordement_page: document.documentElement.scrollWidth > largeur + 1 || main.scrollWidth > main.clientWidth + 1 };
}

async function connecter(p, indice) {
  await p.goto(U);
  await p.evaluate(() => { try { localStorage.removeItem('ae-utilisateur-local'); localStorage.removeItem('ae-session-ouverte'); } catch { /* */ } });
  await p.reload();
  await p.locator('button.profil').nth(indice).click({ timeout: 120000 });
  await p.waitForTimeout(1500);
  // « Tu continues ? » (caisse ouverte) : on continue.
  const question = p.getByRole('button', { name: 'Oui, je continue' });
  if (await question.count()) await question.first().click().catch(() => {});
  await p.waitForTimeout(300);
}

(async () => {
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: TOUS_FORMATS.ordinateur });
  const p = await ctx.newPage();
  let erreurs = [];
  p.on('pageerror', (e) => erreurs.push(`PAGEERROR ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) erreurs.push(m.text()); });
  await p.goto(U);
  await p.locator('button.profil').first().waitFor({ timeout: 120000 });
  const profils = await p.locator('button.profil strong').allInnerTexts();
  const choisis = process.env.PROFILS ? process.env.PROFILS.split(',').map(Number) : profils.map((_, i) => i);
  const sortie = { date: new Date().toISOString(), url: U, profils, ecrans: [], montants: [] };
  for (const i of choisis) {
    await p.setViewportSize(TOUS_FORMATS.ordinateur);
    await connecter(p, i);
    if (await p.getByText(/Choisissez votre mot de passe|nouveau mot de passe/i).count()) {
      sortie.ecrans.push({ profil: profils[i], note: 'mot de passe à changer' });
      continue;
    }
    // Toutes les pages du menu, y compris celles repliées dans « Plus d'outils ».
    const plus = p.locator('aside.menu .menu-plus[aria-expanded=false]');
    if (await plus.count()) await plus.first().click();
    const libelles = await p.evaluate(() => [...document.querySelectorAll('aside.menu nav button:not(.menu-plus), aside.menu nav a')]
      .map((x) => x.innerText.trim()).filter(Boolean));
    // Libellé du menu → écran : lu dans les manifestes des modules (les boutons du menu n'ont pas d'adresse).
    const routes = [...new Set(libelles)].map((libelle) => ({ libelle, route: ROUTES[libelle] ? `#/${ROUTES[libelle]}` : null })).filter((r) => r.route);
    for (const { libelle, route } of routes) {
      for (const [format, vue] of FORMATS) {
        erreurs = [];
        await p.setViewportSize(vue);
        await p.evaluate(() => { window.location.hash = '#/'; });
        await p.waitForTimeout(80);
        await p.evaluate((r) => { window.location.hash = r; }, route);
        const ms = await attendreAffichage(p);
        const m = await p.evaluate(mesurer);
        sortie.ecrans.push({ profil: profils[i], page: libelle, route, format, ms, erreurs: [...erreurs], ...m });
        if (CAPTURES && process.env.CAPTURES_TOUTES === 'oui') {
          const nom = `${route.replace(/[#/?=&]+/g, '-').replace(/^-+|-+$/g, '') || 'accueil'}-${format}.png`;
          await p.screenshot({ path: path.join(CAPTURES, nom), fullPage: true }).catch(() => {});
        }
      }
    }
    fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 1));
    console.log(`profil ${profils[i]} : ${routes.length} pages`);
  }
  // Résistance des montants sur le tableau de bord, aux 9 largeurs, avec un profil qui le voit (gérante par défaut).
  await p.setViewportSize(TOUS_FORMATS.ordinateur);
  const indiceMontants = Math.max(0, profils.findIndex((x) => new RegExp(process.env.PROFIL_MONTANTS ?? 'Mireille', 'i').test(x)));
  await connecter(p, indiceMontants);
  for (const largeur of LARGEURS_MONTANTS) {
    await p.setViewportSize({ width: largeur, height: 900 });
    for (const montant of MONTANTS) {
      await p.evaluate(() => { window.location.hash = '#/'; });
      await p.waitForTimeout(80);
      await p.evaluate(() => { window.location.hash = '#/tableau-de-bord'; });
      await attendreAffichage(p);
      const r = await p.evaluate(resisterMontants, montant);
      sortie.montants.push({ largeur, montant, ...r });
    }
    if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, `tdb-montant-long-${largeur}.png`), fullPage: true }).catch(() => {});
  }
  fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 1));
  const total = (cle) => sortie.ecrans.reduce((s, e) => s + (typeof e[cle] === 'number' ? e[cle] : e[cle] ? 1 : 0), 0);
  console.log(JSON.stringify({
    ecrans: sortie.ecrans.length,
    debordement_page: total('debordement_page'),
    ecrans_hors_ecran: sortie.ecrans.filter((e) => e.hors_ecran > 0).length,
    montants_coupes: total('montants_coupes'),
    petites_cibles: total('petites_cibles'),
    tres_petites_cibles: total('tres_petites_cibles'),
    contraste_faible: total('contraste_faible'),
    erreurs_console: sortie.ecrans.reduce((s, e) => s + (e.erreurs?.length ?? 0), 0),
    montants_longs_coupes: sortie.montants.reduce((s, m) => s + m.coupees, 0),
    montants_longs_hors_carte: sortie.montants.reduce((s, m) => s + m.hors_carte, 0),
    montants_longs_debordement: sortie.montants.filter((m) => m.debordement_page).length,
  }, null, 2));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
