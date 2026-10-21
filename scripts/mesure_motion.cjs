// Mesure reproductible des performances de l'interface (Elite Motion System, docs/motion/MOTION_PERFORMANCE.md).
// Démo locale uniquement (base dans le navigateur, données fictives) :
//   npm run build:demo && npx vite preview --port 4173
//   CHROMIUM_PATH=… node scripts/mesure_motion.cjs [fichier-resultat.json]   (RESEAU=lent : réseau mobile lent)
// Variables : URL_APP (défaut http://localhost:4173/), RALENTIS (défaut "1,4" = processeur normal puis ralenti 4×),
// REPETITIONS (défaut 3), DOSSIER_DIST (défaut dist) pour la taille des fichiers.
// Rien n'est inventé : une mesure impossible est notée null avec la raison.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const RALENTIS = (process.env.RALENTIS ?? '1,4').split(',').map(Number);
const REPETITIONS = Number(process.env.REPETITIONS ?? 3);
const DIST = process.env.DOSSIER_DIST ?? 'dist';
// RESEAU=lent : réseau mobile lent simulé (150 ms de latence, 1,6 Mbit/s descendant, 750 kbit/s montant).
const RESEAU = process.env.RESEAU ?? 'normal';
const SORTIE = process.argv[2] ?? null;

// Taille des fichiers servis à l'ouverture (index.html → script et feuille de style d'entrée) et de l'ensemble.
function tailles() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(DIST, f)), { level: 9 }).length;
  const brut = (f) => fs.statSync(path.join(DIST, f)).size;
  const entree = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const assets = fs.readdirSync(path.join(DIST, 'assets')).map((f) => `assets/${f}`);
  const somme = (liste, f) => liste.reduce((s, x) => s + f(x), 0);
  const js = assets.filter((f) => f.endsWith('.js'));
  const css = assets.filter((f) => f.endsWith('.css'));
  const ko = (n) => Math.round(n / 102.4) / 10;
  return {
    entree_js_ko: ko(somme(entree.filter((f) => f.endsWith('.js')), brut)),
    entree_js_gzip_ko: ko(somme(entree.filter((f) => f.endsWith('.js')), gz)),
    entree_css_ko: ko(somme(entree.filter((f) => f.endsWith('.css')), brut)),
    entree_css_gzip_ko: ko(somme(entree.filter((f) => f.endsWith('.css')), gz)),
    total_js_gzip_ko: ko(somme(js, gz)),
    total_css_gzip_ko: ko(somme(css, gz)),
    fichiers_js: js.length,
  };
}

// Observateurs posés avant tout script de la page : peintures, LCP, décalages, longues tâches, interactions.
const OBSERVATEURS = () => {
  const m = { fcp: null, lcp: null, cls: 0, longues: [], evenements: [] };
  window.__mesure = m;
  const obs = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { /* type non pris en charge */ } };
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') m.fcp = e.startTime; });
  obs('largest-contentful-paint', (e) => { m.lcp = e.startTime; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) m.cls += e.value; });
  obs('longtask', (e) => { m.longues.push([e.startTime, e.duration]); });
  obs('event', (e) => { if (e.interactionId) m.evenements.push([e.startTime, e.duration, e.name]); }, { durationThreshold: 16 });
};

const tbt = (longues, depuis, jusqua = Infinity) => Math.round(longues
  .filter(([t]) => t >= depuis && t <= jusqua).reduce((s, [, d]) => s + Math.max(0, d - 50), 0));

// Latence d'une action jusqu'à l'écran attendu peint, longues tâches et décalages pendant ce temps, puis fluidité
// des 400 ms suivantes (là où jouent les animations d'entrée) : images de plus de 25 ms et pire image.
// La démo fait tourner sa base dans le navigateur : ses requêtes produisent de longues tâches sans rapport avec
// l'interface. Avant chaque action mesurée, on attend 1,5 s sans longue tâche (au plus `max` ms).
async function calme(p, max) {
  await p.waitForFunction(() => {
    const l = window.__mesure.longues;
    const fin = l.length ? Math.max(...l.map(([t, d]) => t + d)) : 0;
    return performance.now() - fin > 1500;
  }, null, { timeout: max, polling: 250 }).catch(() => {});
}

async function chrono(p, action, attente) {
  await calme(p, 60000 * (p.__ralenti ?? 1));
  const avant = await p.evaluate(() => ({ t: performance.now(), cls: window.__mesure.cls }));
  await action();
  await attente();
  const t1 = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))));
  const images = await p.evaluate(() => new Promise((r) => {
    const t = [];
    const fin = performance.now() + 400;
    const pas = (x) => { t.push(x); if (x < fin) requestAnimationFrame(pas); else r(t); };
    requestAnimationFrame(pas);
  }));
  const ecarts = images.slice(1).map((x, i) => x - images[i]);
  const m = await p.evaluate(() => window.__mesure);
  return {
    ms: Math.round(t1 - avant.t),
    tbt: tbt(m.longues, avant.t, t1),
    cls: +(m.cls - avant.cls).toFixed(4),
    images_lentes: ecarts.filter((e) => e > 25).length,
    pire_image_ms: ecarts.length ? Math.round(Math.max(...ecarts)) : null,
  };
}

async function unPassage(navigateur, ralenti) {
  const contexte = await navigateur.newContext({ viewport: { width: 1366, height: 820 } });
  await contexte.addInitScript(OBSERVATEURS);
  const p = await contexte.newPage();
  p.__ralenti = ralenti;
  const cdp = await contexte.newCDPSession(p);
  if (ralenti > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: ralenti });
  if (RESEAU === 'lent') {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }
  const r = {};
  const delai = 120000 * ralenti;

  // 1. Écran de connexion (démo : la base démarre dans le navigateur avant la liste des profils).
  const debut = Date.now();
  await p.goto(U, { waitUntil: 'load' });
  await p.getByText(/Mireille/).first().waitFor({ timeout: delai });
  await p.waitForTimeout(500);
  const m0 = await p.evaluate(() => window.__mesure);
  r.connexion = { fcp: Math.round(m0.fcp), lcp: m0.lcp == null ? null : Math.round(m0.lcp), cls: +m0.cls.toFixed(4), tbt: tbt(m0.longues, 0), profils_visibles_ms: Date.now() - debut };

  // 2. Connexion → tableau de bord.
  r.tableau_de_bord = await chrono(p, async () => {
    await p.getByText(/Mireille/).first().click();
    const question = p.getByRole('dialog', { name: /Bonjour Mireille/ });
    await question.getByRole('button', { name: 'Oui, je continue' }).click({ timeout: delai });
    await question.waitFor({ state: 'detached' });
    await p.evaluate(() => { location.hash = '#/tableau-de-bord'; });
  }, () => p.locator('.kpi-valeur').first().waitFor({ timeout: delai }));
  await p.waitForTimeout(1500);
  // Animations encore actives au repos (une animation infinie consomme du processeur pour rien).
  r.animations_au_repos = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);

  // 3. Changement de module par le menu (tableau de bord → Articles).
  r.changement_module = await chrono(p, () => p.locator('.menu nav button', { hasText: /^Articles$/ }).first().click(),
    () => p.getByRole('button', { name: 'Nouvel article' }).waitFor({ timeout: delai }));
  await p.waitForTimeout(800);

  // 4. Ouverture d'une fenêtre (Nouvel article) puis fermeture par Échap.
  r.ouverture_modale = await chrono(p, () => p.getByRole('button', { name: 'Nouvel article' }).click(),
    () => p.getByRole('dialog').getByLabel('Nom de l’article').waitFor({ timeout: delai }));
  r.fermeture_modale = await chrono(p, () => p.keyboard.press('Escape'), () => p.getByRole('dialog').waitFor({ state: 'detached', timeout: delai }));
  await p.waitForTimeout(500);

  // 5. Caisse : ouverture, 3 articles touchés (latence jusqu'à la ligne du panier), encaissement.
  r.caisse_ouverture = await chrono(p, () => p.evaluate(() => { location.hash = '#/caisse'; }),
    () => p.locator('button.tuile-article:not(.epuise)').first().waitFor({ timeout: delai }));
  await p.waitForTimeout(800);
  const touches = [];
  const tuiles = p.locator('button.tuile-article:not(.epuise)');
  for (let i = 0; i < 3; i += 1) {
    const avant = await p.locator('.panier-ligne').count();
    const mesure = await chrono(p, () => tuiles.nth(i).click(), () => p.waitForFunction((n) => document.querySelectorAll('.panier-ligne').length > n, avant, { timeout: delai }));
    touches.push(mesure.ms);
  }
  r.caisse_ajout_article_ms = touches;
  r.caisse_encaisser = await chrono(p, () => p.getByRole('button', { name: /^Encaisser/ }).first().click(),
    () => p.getByRole('dialog', { name: 'Encaissement' }).getByRole('button', { name: 'Valider la vente' }).waitFor({ timeout: delai }));
  await p.keyboard.press('Escape');
  const m = await p.evaluate(() => window.__mesure);
  // Pire interaction observée (Event Timing, proche de l'INP) et CLS cumulé de la session.
  r.pire_interaction_ms = m.evenements.length ? Math.round(Math.max(...m.evenements.map(([, d]) => d))) : null;
  r.cls_session = +m.cls.toFixed(4);
  r.tbt_session = tbt(m.longues, 0);
  await contexte.close();
  return r;
}

const mediane = (l) => { const v = l.filter((x) => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };

function combiner(passages) {
  const resultat = {};
  const cles = (o, prefixe = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? cles(v, `${prefixe}${k}.`) : [[`${prefixe}${k}`, v]]));
  for (const [cle] of cles(passages[0])) {
    const valeurs = passages.map((pa) => cle.split('.').reduce((o, k) => o?.[k], pa));
    resultat[cle] = Array.isArray(valeurs[0]) ? mediane(valeurs.flat()) : mediane(valeurs);
  }
  return resultat;
}

(async () => {
  const sortie = { date: new Date().toISOString(), url: U, repetitions: REPETITIONS, tailles: null, mesures: {} };
  try { sortie.tailles = tailles(); } catch (e) { sortie.tailles = { erreur: `taille non mesurée : ${e.message}` }; }
  const navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    for (const ralenti of RALENTIS) {
      const passages = [];
      for (let i = 0; i < REPETITIONS; i += 1) {
        try {
          passages.push(await unPassage(navigateur, ralenti));
          console.log(`ralenti ${ralenti}× passage ${i + 1} : ok`);
        } catch (e) {
          console.log(`ralenti ${ralenti}× passage ${i + 1} : ÉCHEC ${e.message.split('\n')[0]}`);
        }
      }
      sortie.mesures[`cpu_${ralenti}x`] = passages.length ? { mediane: combiner(passages), passages } : { erreur: 'aucun passage réussi' };
    }
  } finally {
    await navigateur.close();
  }
  console.log(JSON.stringify({ tailles: sortie.tailles, ...Object.fromEntries(Object.entries(sortie.mesures).map(([k, v]) => [k, v.mediane ?? v])) }, null, 2));
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
