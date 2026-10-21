// Vérifie l'impression de la facture A4 et du ticket Z (démo locale, données fictives) :
//   CHROMIUM_PATH=… node scripts/verif_impression.cjs http://localhost:4173/ prefixe   → « ok » si seul le document sort.
const { chromium } = require('playwright');
(async () => {
  const [url, prefixe] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await p.goto(url);
  await p.locator('button.profil', { hasText: 'Mireille' }).first().click({ timeout: 120000 });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Oui, je continue' }).first().click({ timeout: 4000 }).catch(() => {});
  const verifier = async (nom, selecteur) => {
    await p.emulateMedia({ media: 'print' });
    const etat = await p.evaluate((s) => {
      const doc = document.querySelector(s);
      if (!doc || !doc.getBoundingClientRect().height) return 'document absent';
      const autres = [...document.body.children].filter((e) => !e.classList.contains('zone-impression') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
      return autres.length ? `visible en plus : ${autres.map((e) => e.className || e.tagName).join(', ')}` : 'ok';
    }, selecteur);
    await p.screenshot({ path: `${process.env.DOSSIER ?? '.'}/${prefixe}-${nom}.png`, fullPage: true });
    await p.emulateMedia({ media: 'screen' });
    console.log(nom, etat);
  };
  await p.goto(url + '#/factures');
  await p.locator('main table tbody tr').first().click({ timeout: 30000 });
  await p.locator('.feuille-a4').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(800);
  await verifier('facture-a4', '.zone-impression .feuille-a4');
  await p.goto(url + '#/clotures');
  await p.locator('main table tbody tr').first().click({ timeout: 30000 });
  await p.locator('.zone-impression .ticket').first().waitFor({ state: 'attached', timeout: 30000 });
  await p.waitForTimeout(800);
  await verifier('ticket-z', '.zone-impression .ticket');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
