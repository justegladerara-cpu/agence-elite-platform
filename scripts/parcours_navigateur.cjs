// Parcours complet dans Chromium (Playwright requis) : npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_navigateur.cjs.
// Les captures vont dans captures-parcours/ (ignoré par Git).
require('node:fs').mkdirSync('captures-parcours', { recursive: true });
const { chromium } = require('playwright');
const U = 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT')) erreurs.push(m.text()); });
  let n = 0;
  const shot = async (nom) => p.screenshot({ path: `captures-parcours/j${String(++n).padStart(2,'0')}-${nom}.png` });
  const etape = async (nom, fn) => {
    try { await fn(); await p.waitForTimeout(600); await shot(nom); console.log('OK', nom); }
    catch (e) { await shot('ECHEC-' + nom); console.log('ECHEC', nom, e.message.split('\n')[0]); throw e; }
  };
  try {
    await p.goto(U);
    await etape('connexion', async () => { await p.getByText(/Mireille/).click({ timeout: 90000 }); await p.getByText('Chiffre d’affaires').waitFor(); });
    await etape('article-cree', async () => {
      await p.goto(U + '#/articles');
      await p.getByRole('button', { name: 'Nouvel article' }).click();
      await p.getByLabel('Nom de l’article').fill('Casque test');
      await p.getByLabel('Prix de vente').fill('5000');
      await p.getByLabel('Coût d’achat').fill('3000');
      await p.getByLabel('Stock initial').fill('10');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Casque test').first().waitFor();
    });
    await etape('stock-entree', async () => {
      await p.goto(U + '#/stock');
      await p.getByText('Casque test').first().waitFor();
    });
    await etape('caisse', async () => {
      await p.goto(U + '#/caisse');
      await p.getByPlaceholder('Nom, référence ou code-barres').waitFor();
    });
    await etape('panier', async () => {
      await p.getByPlaceholder('Nom, référence ou code-barres').fill('Casque test');
      await p.locator('.vignette-article, .article-vignette, button:has-text("Casque test")').first().click();
      await p.getByRole('button', { name: 'Plus' }).first().click();
    });
    await etape('paiement', async () => {
      await p.getByRole('button', { name: /Encaisser/ }).click();
      await p.getByRole('button', { name: 'Compte juste' }).click().catch(() => {});
    });
    await etape('vente-validee', async () => {
      await p.getByRole('button', { name: 'Valider la vente' }).click();
      await p.getByRole('button', { name: 'Nouvelle vente' }).waitFor();
    });
    await etape('ventes', async () => {
      await p.goto(U + '#/ventes');
      await p.getByText('10 000 FCFA').first().waitFor().catch(() => {});
    });
    await etape('detail-vente', async () => {
      await p.locator('table.tableau tbody tr').first().click();
      await p.getByRole('button', { name: 'Annuler la vente' }).waitFor();
    });
    await etape('annulation', async () => {
      await p.getByRole('button', { name: 'Annuler la vente' }).click();
      await p.getByLabel(/Motif/).fill('Erreur de saisie');
      await p.locator('.modale button[type=submit], [role=dialog] button[type=submit]').last().click();
      await p.getByText(/Annulée/).first().waitFor();
    });
    await etape('stock-apres', async () => { await p.goto(U + '#/stock'); await p.getByText('Casque test').first().waitFor(); });
    await etape('cloture', async () => { await p.goto(U + '#/clotures'); await p.getByLabel('Espèces comptées dans le tiroir').waitFor(); });
    await etape('ticket-z', async () => {
      await p.getByLabel('Espèces comptées dans le tiroir').fill('50000');
      await p.getByRole('button', { name: 'Clôturer et éditer le ticket Z' }).click();
      await p.getByText(/Z-0000/).first().waitFor();
    });
    await etape('contacts', async () => { await p.goto(U + '#/contacts'); await p.getByText('Chantier Côte Sauvage').first().waitFor(); });
    await etape('contact-fiche', async () => { await p.getByText('Chantier Côte Sauvage').first().click(); });
    await etape('depenses', async () => { await p.goto(U + '#/depenses'); await p.getByRole('button', { name: 'Nouvelle dépense' }).waitFor(); });
    await etape('depense-ajoutee', async () => {
      await p.getByRole('button', { name: 'Nouvelle dépense' }).click();
      await p.getByLabel('Libellé').fill('Carburant livraison');
      await p.getByLabel('Montant').fill('7000');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Carburant livraison').waitFor();
    });
    await etape('tableau', async () => { await p.goto(U + '#/tableau-de-bord'); await p.getByText('Chiffre d’affaires').waitFor(); });
    await etape('tableau-30j', async () => { await p.getByRole('tab', { name: '30 jours' }).click(); await p.getByText('Ventes par jour').waitFor(); });
    await etape('parametres', async () => { await p.goto(U + '#/parametres'); await p.getByText('Identité sur les reçus').waitFor(); });
    await p.setViewportSize({ width: 390, height: 844 });
    await etape('mobile-caisse', async () => { await p.goto(U + '#/caisse'); await p.waitForTimeout(1000); });
    await etape('mobile-tableau', async () => { await p.goto(U + '#/tableau-de-bord'); await p.waitForTimeout(1000); });
  } catch {}
  console.log(erreurs.join('\n') || 'aucune erreur console');
  await b.close();
})();
