// Elite UX 2.0 : premier affichage de l'écran de connexion (build de production servi en local, aucun compte utilisé).
// Profil téléphone modeste : processeur ×4, réseau 150 ms / 1,6 Mbit/s. Mesures de laboratoire, pas d'utilisateurs réels.
//   CHROMIUM_PATH=… URL_APP=http://localhost:4174/ node scripts/ux_mesures_connexion.cjs [sortie.json]
const fs = require('node:fs');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4174/';
const SORTIE = process.argv[2];
const SONDES = () => {
  window.__ux = { lcp: 0, cls: 0, decalages: [] };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ux.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__ux.cls += e.value;
      window.__ux.decalages.push({ valeur: Number(e.value.toFixed(3)), elements: (e.sources ?? []).map((s) => s.node?.className || s.node?.nodeName || '?').slice(0, 3) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
};

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const essais = [];
  for (let i = 0; i < 3; i += 1) {
    const contexte = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await contexte.newPage();
    await page.addInitScript(SONDES);
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(U);
    await page.locator('input[type=email], input[type=password]').first().waitFor({ timeout: 120000 });
    const formulaireMs = Date.now() - t0;
    await page.waitForTimeout(2500);
    const sonde = await page.evaluate(() => window.__ux);
    const ressources = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ nom: r.name, octets: r.decodedBodySize, transfert: r.transferSize })));
    const somme = (ext, cle) => ressources.filter((r) => r.nom.split('?')[0].endsWith(ext)).reduce((s, r) => s + r[cle], 0);
    essais.push({
      formulaireMs, lcpMs: Math.round(sonde.lcp), cls: Number(sonde.cls.toFixed(3)), decalages: sonde.decalages.slice(0, 5),
      jsKo: Math.round(somme('.js', 'octets') / 1024), jsTransfertKo: Math.round(somme('.js', 'transfert') / 1024), cssKo: Math.round(somme('.css', 'octets') / 1024),
    });
    await contexte.close();
  }
  const mediane = (cle) => essais.map((e) => e[cle]).sort((a, c) => a - c)[1];
  const m = { profil: 'téléphone 390×844, processeur ×4, réseau 150 ms / 1,6 Mbit/s', date: new Date().toISOString(),
    formulaireMs: mediane('formulaireMs'), lcpMs: mediane('lcpMs'), cls: mediane('cls'), jsKo: essais[0].jsKo, jsTransfertKo: essais[0].jsTransfertKo, cssKo: essais[0].cssKo, essais };
  console.log(JSON.stringify(m, null, 2));
  if (SORTIE) fs.writeFileSync(SORTIE, JSON.stringify(m, null, 2));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
