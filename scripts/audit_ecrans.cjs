// Audit des écrans (inventaire) : chaque profil de la démo locale ouvre chaque page de son menu, sur ordinateur,
// tablette et téléphone. Mesure : temps d'affichage, erreurs console, débordement horizontal, état vide, nombre
// d'actions visibles. Aucune écriture : on regarde seulement.
// Usage : npm run build:demo && npx vite preview --port 4173, puis
//   CHROMIUM_PATH=… node scripts/audit_ecrans.cjs [fichier.json]
const fs = require('node:fs');
const { chromium } = require('playwright');

const U = process.env.AUDIT_URL || 'http://localhost:4173/';
const SORTIE = process.argv[2] || 'captures-parcours/audit_ecrans.json';
const FORMATS = [
  ['ordinateur', { width: 1366, height: 820 }],
  ['tablette', { width: 820, height: 1180 }],
  ['telephone', { width: 390, height: 844 }],
];

async function attendreAffichage(p) {
  const debut = Date.now();
  // Fin du chargement : plus de squelette ni de « Chargement… » visibles (10 s au plus).
  while (Date.now() - debut < 10000) {
    const enCours = await p.evaluate(() => Boolean(
      document.querySelector('.squelette, .chargement') || /Chargement…|Préparation de la base…/.test(document.querySelector('main')?.innerText ?? '')
    ));
    if (!enCours) break;
    await p.waitForTimeout(100);
  }
  return Date.now() - debut;
}

(async () => {
  fs.mkdirSync('captures-parcours', { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: FORMATS[0][1] });
  const p = await ctx.newPage();
  let erreurs = [];
  p.on('pageerror', (e) => erreurs.push(`PAGEERROR ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) erreurs.push(m.text()); });
  await p.goto(U);
  await p.locator('button.profil').first().waitFor({ timeout: 120000 });
  const profils = await p.locator('button.profil strong').allInnerTexts();
  const resultats = [];
  for (let i = 0; i < profils.length; i += 1) {
    await p.setViewportSize(FORMATS[0][1]);
    await p.goto(U);
    await p.evaluate(() => { localStorage.removeItem('ae-utilisateur-local'); localStorage.removeItem('ae-session-ouverte'); });
    await p.reload();
    await p.locator('button.profil').nth(i).click({ timeout: 120000 });
    await p.waitForTimeout(1500);
    const changer = await p.getByText(/Choisissez votre mot de passe|nouveau mot de passe/i).count();
    if (changer) { resultats.push({ profil: profils[i], note: 'mot de passe à changer' }); continue; }
    const menu = await p.evaluate(() => [...document.querySelectorAll('aside.menu nav button')].map((x) => x.innerText.trim()));
    const ids = [];
    for (const libelle of menu) {
      await p.locator('aside.menu nav button', { hasText: libelle }).first().click({ force: true });
      await p.waitForTimeout(150);
      ids.push({ libelle, route: await p.evaluate(() => window.location.hash) });
    }
    for (const { libelle, route } of ids) {
      for (const [format, vue] of FORMATS) {
        erreurs = [];
        await p.setViewportSize(vue);
        // Navigation interne (pas de rechargement) : mesure le temps d'ouverture d'un écran, comme l'utilisateur.
        await p.evaluate(() => { window.location.hash = '#/'; });
        await p.waitForTimeout(100);
        await p.evaluate((r) => { window.location.hash = r; }, route);
        await p.waitForTimeout(50);
        const ms = await attendreAffichage(p);
        const mesure = await p.evaluate(() => {
          const main = document.querySelector('main');
          const texte = main?.innerText ?? '';
          return {
            titre: document.querySelector('main h1')?.innerText ?? '',
            debordement: document.documentElement.scrollWidth > window.innerWidth + 2,
            vide: Boolean(main?.querySelector('.vide, .empty-state')),
            erreurAffichee: Boolean(main?.querySelector('.erreur')) ? main.querySelector('.erreur').innerText.slice(0, 160) : '',
            boutons: main ? main.querySelectorAll('button:not([disabled])').length : 0,
            petitsBoutons: [...(main?.querySelectorAll('button') ?? [])].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.height < 32); }).length,
            mots: texte.split(/\s+/).length,
          };
        });
        resultats.push({ profil: profils[i], page: libelle, route, format, ms, erreurs: [...erreurs], ...mesure });
      }
    }
    fs.writeFileSync(SORTIE, JSON.stringify(resultats, null, 1));
    console.log(`profil ${profils[i]} : ${ids.length} pages`);
  }
  fs.writeFileSync(SORTIE, JSON.stringify(resultats, null, 1));
  console.log(`audit : ${resultats.length} mesures, ${profils.length} profils → ${SORTIE}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
