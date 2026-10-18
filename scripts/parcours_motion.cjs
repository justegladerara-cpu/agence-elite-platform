// Parcours Elite Motion System (docs/motion/MOTION_TEST_REPORT.md), démo fictive dans Chromium :
//   npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_motion.cjs
// Vérifie : niveau d'animation par défaut, « Réduire les animations » du système (aucune animation qui dure),
// réglage « Animations » mémorisé, focus gardé dans une fenêtre quand la caisse se rafraîchit, téléphone
// (menu en tiroir, panier, aucun défilement horizontal), aucune erreur console.
require('node:fs').mkdirSync('captures-parcours', { recursive: true });
const { chromium } = require('playwright');
const U = process.env.URL_APP ?? 'http://localhost:4173/';

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const erreurs = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT') && !m.text().startsWith('Failed to load resource')) erreurs.push(m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) erreurs.push(`HTTP ${r.status()} ${r.url()}`); });
  };
  let n = 0;
  const etape = async (p, nom, fn) => {
    try { await fn(); await p.screenshot({ path: `captures-parcours/m${String(++n).padStart(2, '0')}-${nom}.png` }); console.log('OK', nom); }
    catch (e) { await p.screenshot({ path: `captures-parcours/m${String(++n).padStart(2, '0')}-ECHEC-${nom}.png` }).catch(() => {}); console.log('ECHEC', nom, e.message.split('\n')[0]); throw e; }
  };
  const connecter = async (p) => {
    await p.goto(U);
    await p.getByText(/Mireille/).first().click({ timeout: 120000 });
    const question = p.getByRole('dialog', { name: /Bonjour Mireille/ });
    await question.getByRole('button', { name: 'Oui, je continue' }).click({ timeout: 60000 });
    await question.waitFor({ state: 'detached' });
  };
  // Animations CSS en cours qui durent réellement (plus de 1 ms) : 0 attendu en mouvement réduit.
  const animationsQuiDurent = (p) => p.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && Number(a.effect?.getComputedTiming?.().duration) > 1).length);

  try {
    // 1. Ordinateur, réglages par défaut.
    const ctx = await b.newContext({ viewport: { width: 1366, height: 820 } });
    const p = await ctx.newPage();
    suivre(p);
    await etape(p, 'niveau-par-defaut', async () => {
      await connecter(p);
      const niveau = await p.evaluate(() => document.documentElement.dataset.animations);
      if (niveau !== 'equilibre') throw new Error(`niveau attendu « equilibre », obtenu « ${niveau} »`);
    });
    await etape(p, 'fenetre-animee', async () => {
      await p.goto(U + '#/articles');
      await p.getByRole('button', { name: 'Nouvel article' }).click();
      const nom = await p.getByRole('dialog').evaluate((d) => getComputedStyle(d).animationName);
      if (!nom.includes('ems-modale')) throw new Error(`animation d'entrée absente (${nom})`);
      await p.keyboard.press('Escape');
      await p.getByRole('dialog').waitFor({ state: 'detached' });
    });
    await etape(p, 'focus-garde-caisse', async () => {
      // La caisse se relit au retour sur la fenêtre (et toutes les 30 s) : le champ en cours de saisie garde le focus.
      await p.goto(U + '#/caisse');
      await p.getByRole('button', { name: 'Fermeture de caisse' }).click();
      const fenetre = p.getByRole('dialog', { name: 'Fermeture de caisse' });
      const champ = fenetre.getByLabel('Espèces comptées dans le tiroir');
      await champ.waitFor();
      const champs = fenetre.locator('input:not([type=hidden]):not([disabled])');
      if (await champs.count() < 2) throw new Error('fenêtre de fermeture sans second champ');
      const dernier = champs.last();
      await dernier.focus();
      await p.evaluate(() => { document.activeElement.dataset.essaiFocus = 'oui'; window.dispatchEvent(new Event('focus')); });
      // La relecture de la démo (base dans le navigateur) prend plusieurs secondes.
      await p.waitForTimeout(12000);
      const garde = await p.evaluate(() => document.activeElement?.dataset?.essaiFocus === 'oui');
      if (!garde) throw new Error('le focus a quitté le champ pendant le rafraîchissement de la caisse');
      await p.keyboard.press('Escape');
    });
    await etape(p, 'reglage-animations', async () => {
      await p.locator('.profil-chip-bouton').click();
      await p.getByRole('menuitem', { name: 'Mon profil' }).click();
      await p.getByRole('tab', { name: 'Préférences' }).click();
      await p.getByLabel('Animations').selectOption('reduit');
      if (await p.evaluate(() => document.documentElement.dataset.animations) !== 'reduit') throw new Error('réglage non appliqué');
      await p.keyboard.press('Escape');
      await p.reload();
      await p.waitForFunction(() => document.documentElement.dataset.animations === 'reduit', null, { timeout: 30000 });
      await p.evaluate(() => localStorage.removeItem('ae-animations'));
    });
    await ctx.close();

    // 2. Téléphone avec « Réduire les animations » demandé par le système.
    const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
    const m = await ctxM.newPage();
    suivre(m);
    await etape(m, 'mouvement-reduit', async () => {
      await connecter(m);
      if (await m.evaluate(() => document.documentElement.dataset.animations) !== 'reduit') throw new Error('« Réduire les animations » du système ignoré');
      await m.goto(U + '#/tableau-de-bord');
      await m.locator('.kpi-valeur').first().waitFor({ timeout: 60000 });
      await m.waitForTimeout(300);
      const restantes = await animationsQuiDurent(m);
      if (restantes) throw new Error(`${restantes} animation(s) jouée(s) malgré le mouvement réduit`);
    });
    await etape(m, 'mobile-menu', async () => {
      await m.getByRole('button', { name: 'Ouvrir le menu' }).click();
      await m.locator('.menu.ouvert').waitFor();
      const gauche = await m.locator('.menu.ouvert').evaluate((e) => e.getBoundingClientRect().left);
      if (Math.abs(gauche) > 1) throw new Error(`menu mal ouvert (gauche ${gauche})`);
      await m.locator('.voile-menu').click({ position: { x: 370, y: 400 } });
      await m.locator('.menu.ouvert').waitFor({ state: 'detached' });
    });
    await etape(m, 'mobile-caisse', async () => {
      await m.goto(U + '#/caisse');
      await m.locator('button.tuile-article:not(.epuise)').first().click({ timeout: 60000 });
      await m.locator('button', { hasText: /^Encaisser/ }).first().waitFor();
      const debord = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (debord > 1) throw new Error(`défilement horizontal de ${debord} px`);
    });
    await ctxM.close();
  } catch (erreur) {
    erreurs.push(`PARCOURS ${erreur.message}`);
  }
  console.log(erreurs.join('\n') || 'aucune erreur console');
  if (process.env.GITHUB_ACTIONS) for (const e of erreurs) console.log(`::error title=Parcours animations::${e.replace(/[\r\n]+/g, ' ').slice(0, 900)}`);
  await b.close();
  if (erreurs.length) process.exitCode = 1;
})();
