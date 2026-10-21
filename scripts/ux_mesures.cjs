// Elite UX 2.0 : mesures de laboratoire sur la démo locale, profil « téléphone modeste »
// (processeur ralenti ×4, réseau mobile lent). Ce ne sont PAS des mesures d'utilisateurs réels.
// npm run build:demo && npx vite preview --port 4173, puis : CHROMIUM_PATH=… node scripts/ux_mesures.cjs [sortie.json]
const fs = require('node:fs');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const SORTIE = process.argv[2];

// Observateurs posés avant le chargement : LCP, CLS, durée des interactions (Event Timing, base de l'INP),
// et nombre de rendus React validés (crochet minimal type DevTools, sans extension).
const SONDES = () => {
  window.__ux = { lcp: 0, cls: 0, evenements: [], rendus: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ux.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ux.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ux.evenements.push({ nom: e.name, duree: e.duration }); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch { /* Event Timing indisponible */ }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject() { return 1; }, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot() { window.__ux.rendus += 1; },
  };
};

async function chrono(page, action, attente) {
  const debut = Date.now();
  await action();
  await attente();
  return Date.now() - debut;
}

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const contexte = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await contexte.newPage();
  await page.addInitScript(SONDES);
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Network.enable');
  // Réseau mobile lent : 150 ms de latence, 1,6 Mbit/s descendant, 750 kbit/s montant. RESEAU=0 le coupe
  // (la démo embarque une base de plusieurs Mo : le réseau masquerait alors le temps de l'interface).
  const reseauLent = process.env.RESEAU !== '0';
  if (reseauLent) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const m = { profil: `téléphone 390×844, processeur ×4${reseauLent ? ', réseau 150 ms / 1,6 Mbit/s' : ', réseau local'}`, date: new Date().toISOString() };
  const t0 = Date.now();
  await page.goto(U);
  await page.getByText(/Mireille/).first().waitFor({ timeout: 240000 });
  m.ouvertureEcranConnexionMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const avant = await page.evaluate(() => ({ lcp: window.__ux.lcp, cls: window.__ux.cls }));
  m.lcpConnexionMs = Math.round(avant.lcp);
  m.clsConnexion = Number(avant.cls.toFixed(3));

  await page.getByText(/Mireille/).first().click();
  await page.getByText('Qu’est-ce que vous voulez faire ?').first().waitFor({ timeout: 120000 });
  const question = page.getByRole('dialog', { name: /Bonjour Mireille/ });
  await question.getByRole('button', { name: 'Oui, je continue' }).click({ timeout: 20000 }).catch(() => {});

  // Ouverture de la caisse (navigation interne).
  m.ouvertureCaisseMs = await chrono(page, () => page.evaluate(() => { window.location.hash = '#/caisse'; }),
    () => page.getByPlaceholder('Nom, référence ou code-barres').waitFor({ timeout: 120000 }));
  await page.locator('button.tuile-article').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__ux.evenements = []; window.__ux.rendus = 0; });
  // Ajout au panier : toucher la première tuile disponible.
  const tuile = page.locator('button.tuile-article:not(.epuise)').first();
  m.ajoutPanierMs = await chrono(page, () => tuile.click(), () => page.locator('.panier-ligne').first().waitFor({ state: 'attached' }));
  await page.waitForTimeout(400);
  m.rendusReactAjoutPanier = await page.evaluate(() => window.__ux.rendus);
  // Encaisser puis valider.
  await page.evaluate(() => { window.__ux.rendus = 0; });
  m.ouvertureEncaissementMs = await chrono(page, () => page.getByRole('button', { name: /Encaisser/ }).last().click(),
    () => page.getByRole('dialog', { name: 'Encaissement' }).waitFor());
  const enc = page.getByRole('dialog', { name: 'Encaissement' });
  m.validationVenteMs = await chrono(page, () => enc.getByRole('button', { name: 'Valider la vente' }).click(),
    () => page.getByRole('button', { name: 'Nouvelle vente' }).waitFor({ timeout: 60000 }));
  m.rendusReactEncaissement = await page.evaluate(() => window.__ux.rendus);
  await page.getByRole('button', { name: 'Nouvelle vente' }).click();
  const evts = await page.evaluate(() => window.__ux.evenements);
  m.interactionLaPlusLongueMs = Math.round(Math.max(0, ...evts.filter((e) => ['click', 'pointerup', 'pointerdown', 'keydown', 'keyup'].includes(e.nom)).map((e) => e.duree)));

  // Tableau de bord : ouverture et rendus pendant le chargement des chiffres.
  await page.evaluate(() => { window.__ux.rendus = 0; });
  m.ouvertureTableauDeBordMs = await chrono(page, () => page.evaluate(() => { window.location.hash = '#/tableau-de-bord'; }),
    () => page.locator('.kpi').first().waitFor({ timeout: 120000 }));
  await page.waitForTimeout(2500);
  m.rendusReactTableauDeBord = await page.evaluate(() => window.__ux.rendus);
  m.clsSession = Number((await page.evaluate(() => window.__ux.cls)).toFixed(3));

  // Poids des fichiers (non compressés) chargés pendant la session.
  const ressources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ nom: r.name, octets: r.decodedBodySize, transfert: r.transferSize })));
  const somme = (ext) => ressources.filter((r) => r.nom.split('?')[0].endsWith(ext)).reduce((s, r) => s + r.octets, 0);
  m.jsChargeKo = Math.round(somme('.js') / 1024);
  m.cssChargeKo = Math.round(somme('.css') / 1024);
  console.log(JSON.stringify(m, null, 2));
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(m, null, 2));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
