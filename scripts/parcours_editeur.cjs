// Parcours du compte Agence Elite (super admin) sur le SaaS, dans Chromium (Playwright requis) :
// npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_editeur.cjs.
// Depuis le 2026-10-19, l'administration de la plateforme n'existe plus ici : elle se fait dans le CRM
// (crm.agence-elite.fr). Le super admin est renvoyé vers le CRM, et les anciennes adresses #/editeur/… n'ouvrent rien.
const { chromium } = require('playwright');
const fs = require('node:fs');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
fs.mkdirSync('captures-parcours', { recursive: true });

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(`PAGEERROR ${e.message}`));
  p.on('response', (r) => { if (r.status() === 404) erreurs.push(`404 ${r.url()}`); });
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT')) erreurs.push(`${m.text()} ${m.location()?.url ?? ''}`); });
  let n = 0;
  const shot = (nom) => p.screenshot({ path: `captures-parcours/e${String(++n).padStart(2, '0')}-${nom}.png` });
  const etape = async (nom, fn) => {
    try {
      await fn();
      await p.waitForTimeout(500);
      await shot(nom);
      console.log('OK', nom);
    } catch (e) {
      await shot(`ECHEC-${nom}`);
      console.log('ECHEC', nom, e.message.split('\n')[0]);
      throw e;
    }
  };
  const dialogue = () => p.getByRole('dialog').last();

  try {
    await p.goto(U);
    await etape('super-admin-renvoye-vers-crm', async () => {
      await p.locator('button.profil', { hasText: 'Juste Glade' }).first().click({ timeout: 90000 });
      await p.getByRole('heading', { name: 'Administration dans le CRM' }).waitFor();
      const lien = await p.getByRole('link', { name: 'Ouvrir le CRM' }).getAttribute('href');
      if (lien !== 'https://crm.agence-elite.fr') throw new Error(`Lien CRM inattendu : ${lien}`);
    });
    await etape('anciennes-adresses-fermees', async () => {
      for (const ecran of ['tableau', 'clients', 'partenaires', 'offres', 'comptes']) {
        await p.goto(`${U}#/editeur/${ecran}`);
        await p.getByRole('heading', { name: 'Administration dans le CRM' }).waitFor();
        if (await p.getByRole('button', { name: 'Nouveau client' }).count()) throw new Error(`#/editeur/${ecran} montre encore l’administration`);
      }
    });
    await p.setViewportSize({ width: 390, height: 844 });
    await etape('mobile', async () => {
      await p.getByRole('heading', { name: 'Administration dans le CRM' }).waitFor();
      const trop = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (trop) throw new Error('Débordement horizontal');
    });
  } catch {
    process.exitCode = 1;
  }
  console.log(erreurs.join('\n') || 'aucune erreur console');
  // En CI, chaque erreur devient une annotation GitHub (lisible sans télécharger le journal).
  if (process.env.GITHUB_ACTIONS) for (const e of erreurs) console.log(`::error title=Parcours éditeur::${e.replace(/[\r\n]+/g, ' ').slice(0, 900)}`);
  await b.close();
  if (erreurs.length) process.exitCode = 1;
})();
