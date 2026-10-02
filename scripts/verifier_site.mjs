// Vérifie le site publié dans un vrai navigateur (Playwright requis) :
// en-têtes de sécurité, mode production (base Supabase), refus d'un mauvais mot
// de passe, puis connexion d'un compte fictif et affichage de ses données.
// Usage : SITE_URL=… VERIF_EMAIL=… VERIF_MOT_DE_PASSE=… node scripts/verifier_site.mjs
import { chromium } from 'playwright';

const url = process.env.SITE_URL.replace(/\/?$/, '/');
const { VERIF_EMAIL: email, VERIF_MOT_DE_PASSE: motDePasse } = process.env;
let echecs = 0;
const etape = async (nom, fn) => {
  try {
    const detail = await fn();
    console.log(`OK  ${nom}${detail ? ' — ' + detail : ''}`);
  } catch (err) {
    echecs++;
    console.log(`ÉCHEC  ${nom} — ${err.message.split('\n')[0]}`);
  }
};

await etape('site joignable et en-têtes de sécurité', async () => {
  const r = await fetch(url);
  if (r.status !== 200) throw new Error(`statut ${r.status}`);
  const csp = r.headers.get('content-security-policy') || '';
  if (!csp.includes("frame-ancestors 'none'")) throw new Error('CSP absente');
  if (!r.headers.get('strict-transport-security')) throw new Error('HSTS absent');
  return 'HTTP 200, CSP, HSTS';
});

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1366, height: 820 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

await etape('écran de connexion en mode production', async () => {
  await page.goto(url);
  await page.getByText('Créer mon compte').waitFor({ timeout: 30000 });
  return 'onglets Connexion / Créer mon compte';
});
await etape('mauvais mot de passe refusé', async () => {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.locator('.erreur, [role="alert"]').first().waitFor({ timeout: 20000 });
  return (await page.locator('.erreur, [role="alert"]').first().innerText()).trim();
});
await etape('connexion du gérant fictif', async () => {
  await page.getByLabel('Mot de passe').fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByText('Chiffre d’affaires').first().waitFor({ timeout: 30000 });
  return 'tableau de bord affiché';
});
await etape('données de l’établissement visibles', async () => {
  await page.goto(url + '#/articles');
  await page.getByText('Savon fictif 400 g').first().waitFor({ timeout: 20000 });
  return 'articles chargés depuis la base';
});
await etape('aucune erreur dans la console', async () => {
  const graves = erreurs.filter((e) => !/400|Invalid login|identifiants/i.test(e));
  if (graves.length) throw new Error(graves.slice(0, 3).join(' | '));
});
await navigateur.close();
console.log(echecs ? `\n${echecs} vérification(s) du site en échec.` : '\nSite vérifié.');
process.exit(echecs ? 1 : 0);
