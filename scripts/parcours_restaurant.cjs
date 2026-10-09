// Parcours Restaurant dans Chromium (démo locale, données fictives) : affectation d'un serveur, « Mes tables »,
// commande sur table → envoi cuisine/bar, transfert, page Serveurs, catégories d'articles et déplacement en masse,
// sur ordinateur, tablette et téléphone. Prérequis : npm run build:demo && npx vite preview --port 4173.
// CHROMIUM_PATH : navigateur déjà installé. Captures dans captures-parcours/ (ignoré par Git).
require('node:fs').mkdirSync('captures-parcours', { recursive: true });
const { chromium } = require('playwright');
const U = process.env.URL_APP ?? 'http://localhost:4173/';

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT') && !m.text().startsWith('Failed to load resource')) erreurs.push(m.text()); });
  let n = 0;
  const shot = (nom) => p.screenshot({ path: `captures-parcours/r${String(++n).padStart(2, '0')}-${nom}.png`, fullPage: true });
  const etape = async (nom, fn) => {
    try { await fn(); await p.waitForTimeout(500); await shot(nom); console.log('OK', nom); }
    catch (e) { await shot('ECHEC-' + nom); console.log('ECHEC', nom, e.message.split('\n')[0]); throw e; }
  };
  const aucuneErreurVisible = async () => {
    const visibles = await p.locator('.erreur:visible').allTextContents();
    if (visibles.length) throw new Error(visibles.join(' | '));
  };
  const profil = async (nom) => {
    await p.evaluate(() => { localStorage.removeItem('ae-utilisateur-local'); localStorage.removeItem('ae-session-ouverte'); });
    await p.goto(U);
    await p.reload();
    await p.getByText(nom).first().click({ timeout: 90000 });
    await p.waitForTimeout(1500);
  };
  let T = 'T1';
  const table = () => p.getByRole('button', { name: new RegExp(`^Table ${T},`) });
  try {
    await p.goto(U);
    await etape('gerante-salle', async () => {
      await p.getByText(/Gisèle/).first().click({ timeout: 90000 });
      await p.waitForTimeout(1500);
      await p.goto(U + '#/salle');
      await p.getByRole('heading', { name: 'Salle' }).first().waitFor();
      await p.getByRole('button', { name: 'Mes tables' }).waitFor();
      await aucuneErreurVisible();
      // Première table libre du plan (les données de démo en occupent déjà certaines).
      const libre = await p.getByRole('button', { name: /^Table .*, libre/ }).first().getAttribute('aria-label');
      T = libre.match(/^Table (.*?), libre/)[1];
    });
    await etape('affectation-table', async () => {
      await p.getByRole('button', { name: 'Affecter les serveurs' }).click();
      await table().click();
      const choix = p.locator('.modale select').first();
      const valeur = await choix.locator('option', { hasText: /Rodrigue/ }).first().getAttribute('value');
      await choix.selectOption(valeur);
      await p.getByLabel('Motif (facultatif)').fill('Service du soir');
      await p.getByRole('button', { name: 'Affecter' }).click();
      await p.getByText(/ : .*affecté/).first().waitFor();
      await p.getByRole('button', { name: 'Terminer l’affectation' }).click();
      await p.getByRole('button', { name: new RegExp(`^Table ${T},.*serveur Rodrigue`) }).waitFor();
    });
    await etape('filtre-par-serveur', async () => {
      const filtre = p.getByLabel('Filtrer par serveur');
      const valeur = await filtre.locator('option', { hasText: /Rodrigue/ }).first().getAttribute('value');
      await filtre.selectOption(valeur);
      await table().waitFor();
      await filtre.selectOption('');
      await p.getByRole('button', { name: 'Mes tables' }).click();
      await p.getByText('Aucune table ne vous est affectée pour le moment.').waitFor();
      await p.getByRole('button', { name: 'Toutes', exact: true }).click();
    });
    await etape('ouverture-commande', async () => {
      await table().click();
      await p.getByText(/Serveur de la commande : Rodrigue/).waitFor();
      await p.getByRole('button', { name: 'Ouvrir' }).click();
      await p.getByText(/serveur : Rodrigue/).first().waitFor();
    });
    await etape('ajout-et-envoi', async () => {
      await p.locator('.tuile-article:not([disabled])').first().click();
      await p.getByRole('button', { name: /Envoyer \(1\)/ }).waitFor();
      await p.locator('.tuile-article:not([disabled])').nth(1).click();
      await p.getByRole('button', { name: /Envoyer \(2\)/ }).click();
      await p.getByText('Envoyé en cuisine').first().waitFor();
      await aucuneErreurVisible();
    });
    await etape('transfert-serveur', async () => {
      await p.getByRole('button', { name: 'Plus d’actions' }).click();
      await p.getByRole('menuitem', { name: 'Transférer à un autre serveur' }).click();
      const choix = p.locator('.modale select').first();
      const valeur = await choix.locator('option:not([disabled])').first().getAttribute('value');
      await choix.selectOption(valeur);
      await p.locator('.modale input').first().fill('Fin de service');
      await p.getByRole('button', { name: 'Transférer' }).click();
      await p.getByText(/transférée à/).first().waitFor();
    });
    await etape('page-serveurs', async () => {
      await p.goto(U + '#/salle/serveurs');
      await p.getByRole('heading', { name: 'Serveurs' }).first().waitFor();
      await p.getByText('Historique des affectations').waitFor();
      await p.getByText('Service du soir').first().waitFor();
      await p.getByText('Transferts de commandes').waitFor();
      await aucuneErreurVisible();
    });
    await etape('categories', async () => {
      await p.goto(U + '#/articles');
      await p.getByRole('heading', { name: 'Articles' }).first().waitFor();
      await p.getByRole('tab', { name: 'Catégories' }).click();
      await p.getByRole('button', { name: 'Nouvelle catégorie' }).click();
      await p.getByLabel('Nom de la catégorie').fill('Spécialités du chef');
      await p.getByLabel('Description (facultatif)').fill('Catégorie créée par le parcours');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Catégorie créée').first().waitFor();
      await p.getByText('Spécialités du chef').first().waitFor();
      await p.getByRole('button', { name: /^Monter Spécialités du chef/ }).click();
      await p.getByText('Ordre enregistré').first().waitFor();
    });
    await etape('deplacement-en-masse', async () => {
      await p.getByRole('tab', { name: 'En vente' }).click();
      await p.locator('tbody input[type=checkbox]').nth(0).check();
      await p.locator('tbody input[type=checkbox]').nth(1).check();
      await p.getByText('2 sélectionné(s)').waitFor();
      const destination = p.getByLabel('Catégorie de destination');
      const valeur = await destination.locator('option', { hasText: 'Spécialités du chef' }).getAttribute('value');
      await destination.selectOption(valeur);
      await p.getByRole('button', { name: 'Changer de catégorie' }).click();
      await p.getByText(/2 article\(s\) déplacé\(s\)/).first().waitFor();
    });
    await etape('archivage-categorie', async () => {
      await p.getByRole('tab', { name: 'Catégories' }).click();
      const ligne = p.locator('.ligne-categorie', { hasText: 'Spécialités du chef' });
      await ligne.getByRole('button', { name: 'Plus d’actions' }).click();
      await p.getByRole('menuitem', { name: 'Archiver' }).click();
      await p.getByText(/contient 2 article\(s\) en vente/).waitFor();
      const destination = p.locator('.modale select').first();
      await destination.selectOption({ index: 1 });
      await p.getByRole('button', { name: 'Archiver', exact: true }).click();
      await p.getByText(/archivée, 2 article\(s\) déplacé\(s\)/).first().waitFor();
      await p.getByLabel('Voir les archivées').check();
      await p.getByText('Spécialités du chef').first().waitFor();
    });
    await profil('Rodrigue');
    await etape('serveur-mes-tables', async () => {
      await p.goto(U + '#/salle');
      await p.getByRole('button', { name: 'Mes tables' }).click();
      await table().waitFor();
      if (await p.getByRole('button', { name: 'Affecter les serveurs' }).count()) throw new Error('Un serveur ne doit pas affecter les tables');
      await p.goto(U + '#/salle/serveurs');
      await p.getByText('Votre activité sur la période.').waitFor();
      await aucuneErreurVisible();
    });
    for (const [nom, largeur, hauteur] of [['tablette', 820, 1180], ['telephone', 390, 844]]) {
      await p.setViewportSize({ width: largeur, height: hauteur });
      await etape(`${nom}-salle`, async () => {
        await p.goto(U + '#/salle');
        await p.getByRole('button', { name: 'Mes tables' }).waitFor();
        const debordement = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (debordement > 2) throw new Error(`Défilement horizontal de ${debordement} px`);
      });
      await etape(`${nom}-commande`, async () => {
        await table().click();
        await p.getByPlaceholder('Chercher un plat ou une boisson').fill('a');
        await p.locator('.tuile-article:not([disabled])').first().click();
        if (largeur < 900) await p.locator('.barre-commande-mobile').waitFor();
        const debordement = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (debordement > 2) throw new Error(`Défilement horizontal de ${debordement} px`);
      });
    }
  } catch (erreur) {
    erreurs.push(`PARCOURS ${erreur.message}`);
  }
  console.log(erreurs.join('\n') || 'aucune erreur console');
  await b.close();
  if (erreurs.length) process.exitCode = 1;
})();
