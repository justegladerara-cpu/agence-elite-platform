// Elite UX 2.0 : parcours quotidiens des clients en service (même chemin que The Dream et Hôtel 2i), rejoués sur la
// démo locale avec des données fictives. Aucune donnée réelle, aucune base distante.
//   npm run build:demo && npx vite preview --port 4173, puis : CHROMIUM_PATH=… node scripts/ux_parcours_clients.cjs
// Vérifie : vente en caisse, reçu imprimé, Ventes › reçu, ticket Z imprimé, facture A4 imprimée, écrans Salle et Hôtel,
// au téléphone (390 px) et à l'ordinateur (1366 px). Le rendu « impression » est vérifié avec le média print.
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const resultats = [];
let pageCourante = null;

async function etape(nom, fn) {
  try {
    await fn();
    resultats.push(['OK', nom]);
    console.log(`OK ${nom}`);
  } catch (e) {
    resultats.push(['ÉCHEC', nom, e.message.split('\n')[0]]);
    if (process.env.CAPTURE_ECHEC && pageCourante) await pageCourante.screenshot({ path: `${process.env.CAPTURE_ECHEC}/${nom.replace(/\W+/g, '_')}.png` }).catch(() => {});
    console.log(`ÉCHEC ${nom} : ${e.message.split('\n')[0]}`);
  }
}

// Visible à l'impression : la zone d'impression est affichée, l'application est masquée.
async function imprimable(p, selecteur) {
  await p.emulateMedia({ media: 'print' });
  const etat = await p.evaluate((sel) => {
    const cible = document.querySelector(`.zone-impression ${sel}`);
    if (!cible) return 'absent';
    const r = cible.getBoundingClientRect();
    const s = getComputedStyle(cible);
    const racine = document.getElementById('root');
    const appli = racine ? getComputedStyle(racine).display : 'none';
    if (s.visibility !== 'visible' || s.display === 'none' || r.width === 0 || r.height === 0) return `caché (${s.visibility}, ${s.display})`;
    if (appli !== 'none') return 'l’application s’imprime aussi';
    return 'ok';
  }, selecteur);
  await p.emulateMedia({ media: 'screen' });
  if (etat !== 'ok') throw new Error(`${selecteur} non imprimable : ${etat}`);
}

async function connecter(p, profil) {
  await p.evaluate(() => { localStorage.removeItem('ae-utilisateur-local'); localStorage.removeItem('ae-session-ouverte'); }).catch(() => {});
  await p.goto(U);
  await p.getByText(profil).first().click({ timeout: 180000 });
  await p.waitForTimeout(1500);
  // Caisse encore ouverte : « Tu continues ? » s'affiche une fois après la connexion.
  const question = p.getByRole('dialog', { name: /Bonjour/ });
  await question.getByRole('button', { name: 'Oui, je continue' }).click({ timeout: 15000 }).catch(() => {});
  await question.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
}

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [largeur, hauteur] of [[1366, 820], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: largeur, height: hauteur } });
    pageCourante = p;
    const erreurs = [];
    p.on('pageerror', (e) => erreurs.push(e.message));
    await p.goto(U);
    await p.evaluate(() => { window.print = () => {}; });
    await etape(`${largeur} connexion caisse`, () => connecter(p, 'Mireille'));
    await etape(`${largeur} vente en caisse`, async () => {
      await p.goto(`${U}#/caisse`);
      await p.evaluate(() => { window.print = () => {}; });
      await p.locator('button.tuile-article:not(.epuise)').first().click({ timeout: 60000 });
      await p.getByRole('button', { name: /^Encaisser/ }).last().click();
      const enc = p.getByRole('dialog', { name: 'Encaissement' });
      await enc.getByRole('button', { name: 'Valider la vente' }).click();
      await p.getByRole('button', { name: 'Nouvelle vente' }).waitFor({ timeout: 60000 });
    });
    await etape(`${largeur} reçu imprimé`, async () => {
      await p.getByRole('dialog').getByRole('button', { name: 'Imprimer' }).click();
      await imprimable(p, '.ticket');
      await p.getByRole('button', { name: 'Nouvelle vente' }).click();
    });
    await etape(`${largeur} Ventes › reçu`, async () => {
      await p.goto(`${U}#/ventes`);
      await p.evaluate(() => { window.print = () => {}; });
      await p.locator('table.tableau tbody tr, .fiche-liste-ligne').first().click({ timeout: 60000 });
      const dialogue = p.getByRole('dialog').first();
      await dialogue.waitFor();
      await dialogue.getByRole('button', { name: /Reçu|Imprimer/ }).first().click();
      // Le reçu se charge dans sa fenêtre : on attend qu'il soit là avant de vérifier l'impression.
      await p.locator('.zone-impression .ticket').waitFor({ state: 'attached', timeout: 30000 });
      await imprimable(p, '.ticket');
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    });
    await etape(`${largeur} ticket Z imprimé`, async () => {
      await p.goto(`${U}#/clotures`);
      await p.evaluate(() => { window.print = () => {}; });
      await p.locator('table.tableau tbody tr').first().click({ timeout: 60000 });
      await p.getByRole('dialog').getByRole('button', { name: 'Imprimer' }).click();
      await imprimable(p, '.ticket');
      await p.keyboard.press('Escape');
    });
    await etape(`${largeur} facture A4 imprimée`, async () => {
      await p.goto(`${U}#/factures`);
      await p.locator('table.tableau tbody tr').first().click({ timeout: 60000 });
      await p.getByRole('button', { name: 'Imprimer / PDF' }).waitFor({ timeout: 30000 });
      await imprimable(p, '.feuille-a4');
    });
    await etape(`${largeur} restaurant (salle)`, async () => {
      await connecter(p, 'Gisèle');
      await p.goto(`${U}#/salle`);
      await p.getByRole('heading', { name: /Salle/i }).first().waitFor({ timeout: 30000 });
    });
    await etape(`${largeur} hôtel (réception et chambres)`, async () => {
      await connecter(p, 'Serge');
      await p.goto(`${U}#/hotel`);
      await p.getByRole('heading', { name: /Réception/i }).first().waitFor({ timeout: 30000 });
      await p.goto(`${U}#/chambres`);
      await p.getByRole('heading', { name: /Chambres/i }).first().waitFor({ timeout: 30000 });
      const debord = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (debord > 1) throw new Error(`la page dépasse l'écran de ${debord} px`);
    });
    if (erreurs.length) resultats.push(['ÉCHEC', `${largeur} erreurs de page`, erreurs.join(' | ')]);
    await p.close();
  }
  await b.close();
  const echecs = resultats.filter((r) => r[0] !== 'OK');
  console.log(echecs.length ? `${echecs.length} échec(s)` : `parcours clients : ${resultats.length}/${resultats.length} OK`);
  process.exit(echecs.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
