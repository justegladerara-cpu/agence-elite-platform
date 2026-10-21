// Captures avant / après des écrans principaux (Elite UX 2.0). Démo locale uniquement, données fictives :
//   npm run build:demo && npx vite preview --port 4173
//   CHROMIUM_PATH=… node scripts/captures_ux.cjs <dossier> [prefixe]
// Variables : URL_APP, PROFIL (texte du profil de démo, défaut « Patron »), LARGEURS (ex. "390,1366").
// Chaque écran est pris en pleine page aux largeurs demandées, puis en thème sombre et en « texte très grand ».
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const DOSSIER = process.argv[2] ?? 'captures-parcours/ux';
const PREFIXE = process.argv[3] ?? '';
const PROFIL = new RegExp(process.env.PROFIL ?? 'Patron', 'i');
const LARGEURS = (process.env.LARGEURS ?? '320,375,390,430,768,1024,1366,1440,1920').split(',').map(Number);
// Écrans pris à toutes les largeurs, puis écrans pris en téléphone et ordinateur seulement.
const PRINCIPAUX = (process.env.PRINCIPAUX ?? 'accueil,tableau-de-bord,caisse').split(',');
const AUTRES = (process.env.AUTRES ?? 'ventes,articles,stock,clotures,factures,contacts,depenses,hotel,salle,parametres,membres,rapports').split(',');
const HAUTEUR = (l) => (l < 600 ? 844 : l < 1100 ? 1024 : 900);

async function attendre(p) {
  const debut = Date.now();
  while (Date.now() - debut < 10000) {
    const enCours = await p.evaluate(() => Boolean(document.querySelector('main .squelette, main .chargement')));
    if (!enCours) break;
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(U);
  await p.locator('button.profil', { hasText: PROFIL }).first().click({ timeout: 120000 });
  await p.waitForTimeout(1500);
  // Question « Tu continues à travailler ? » (caisse ouverte) : elle peut arriver après le chargement.
  await p.getByRole('button', { name: 'Oui, je continue' }).first().click({ timeout: 8000 }).catch(() => {});
  const prendre = async (route, largeur, suffixe = '') => {
    await p.setViewportSize({ width: largeur, height: HAUTEUR(largeur) });
    await p.evaluate(() => { window.location.hash = '#/'; });
    await p.waitForTimeout(60);
    await p.evaluate((r) => { window.location.hash = `#/${r}`; }, route);
    await attendre(p);
    const question = p.getByRole('button', { name: 'Oui, je continue' });
    if (await question.count()) { await question.first().click().catch(() => {}); await attendre(p); }
    const reel = await p.evaluate(() => window.location.hash.replace('#/', '').split('?')[0]);
    if (reel.split('/')[0] !== route.split('/')[0]) return false;
    const nom = `${PREFIXE}${route.replace(/[/?=&]+/g, '-')}-${largeur}${suffixe}.png`;
    // Le contenu défile dans <main> : on agrandit la fenêtre à la hauteur du contenu pour tout voir.
    const h = await p.evaluate(() => {
      const m = document.querySelector('main');
      return Math.max(document.documentElement.scrollHeight, m ? m.scrollHeight + m.getBoundingClientRect().top : 0);
    });
    await p.setViewportSize({ width: largeur, height: Math.round(Math.min(Math.max(h, HAUTEUR(largeur)), 7000)) });
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(DOSSIER, nom) });
    return true;
  };
  let n = 0;
  for (const route of PRINCIPAUX) for (const l of LARGEURS) if (await prendre(route, l)) n += 1;
  for (const route of AUTRES) for (const l of [390, 1366]) if (await prendre(route, l)) n += 1;
  // Thème sombre et texte très grand (préférences de cet appareil).
  for (const [cle, valeur, suffixe] of [['theme', 'sombre', '-sombre'], ['texte', 'tres_grand', '-texte-tres-grand']]) {
    await p.evaluate(([c, v]) => {
      const brut = JSON.parse(localStorage.getItem('ae-affichage') ?? '{}');
      localStorage.setItem('ae-affichage', JSON.stringify({ ...brut, [c]: v }));
      document.documentElement.dataset[c] = v;
    }, [cle, valeur]);
    for (const route of PRINCIPAUX) for (const l of [390, 1366]) if (await prendre(route, l, suffixe)) n += 1;
    await p.evaluate(([c]) => {
      const brut = JSON.parse(localStorage.getItem('ae-affichage') ?? '{}');
      delete brut[c];
      localStorage.setItem('ae-affichage', JSON.stringify(brut));
      delete document.documentElement.dataset[c];
    }, [cle]);
  }
  console.log(`${n} captures dans ${DOSSIER}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
