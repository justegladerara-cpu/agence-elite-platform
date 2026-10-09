// Parcours complet dans Chromium (Playwright requis) : npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_navigateur.cjs.
// Les captures vont dans captures-parcours/ (ignoré par Git).
require('node:fs').mkdirSync('captures-parcours', { recursive: true });
const { chromium } = require('playwright');
const U = 'http://localhost:4173/';
(async () => {
  // CHROMIUM_PATH : navigateur déjà installé (environnements sans accès au CDN Playwright).
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
  // Les ressources en échec sont signalées avec leur adresse (le message console seul ne la donne pas).
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT') && !m.text().startsWith('Failed to load resource')) erreurs.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) erreurs.push(`HTTP ${r.status()} ${r.url()}`); });
  let n = 0;
  const shot = async (nom) => p.screenshot({ path: `captures-parcours/j${String(++n).padStart(2,'0')}-${nom}.png` });
  const etape = async (nom, fn) => {
    try { await fn(); await p.waitForTimeout(600); await shot(nom); console.log('OK', nom); }
    catch (e) { await shot('ECHEC-' + nom); console.log('ECHEC', nom, e.message.split('\n')[0]); throw e; }
  };
  try {
    await p.goto(U);
    await etape('connexion', async () => { await p.getByText(/Mireille/).click({ timeout: 90000 }); await p.getByText('Chiffre d’affaires').first().waitFor(); });
    await etape('article-cree', async () => {
      await p.goto(U + '#/articles');
      await p.getByRole('button', { name: 'Nouvel article' }).click();
      await p.getByLabel('Nom de l’article').fill('Casque test');
      await p.getByLabel('Prix de vente').fill('5000');
      await p.getByLabel('Coût d’achat').fill('3000');
      await p.getByLabel(/Suivre les quantités de cet article/).check();
      await p.getByLabel('Stock initial').fill('10');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Casque test').first().waitFor();
    });
    await etape('articles-lot', async () => {
      await p.goto(U + '#/articles');
      const cases = p.getByRole('checkbox', { name: /^Sélectionner (?!les)/ });
      await cases.nth(0).check();
      await cases.nth(1).check();
      await p.getByText('2 sélectionné(s)').waitFor();
      await p.getByLabel('Action groupée').selectOption('ne_pas_suivre');
      await p.getByRole('button', { name: 'Appliquer' }).click();
      await p.getByText(/2 article\(s\) : ne pas suivre le stock/).first().waitFor();
      await p.getByLabel('Filtrer par stock').selectOption('non_suivis');
      await p.getByLabel('Filtrer par stock').selectOption('');
      // Remise en état pour les étapes suivantes : les deux mêmes articles reprennent le suivi du stock.
      await cases.nth(0).check();
      await cases.nth(1).check();
      await p.getByLabel('Action groupée').selectOption('suivre');
      await p.getByRole('button', { name: 'Appliquer' }).click();
      await p.getByText(/2 article\(s\) : suivre le stock/).first().waitFor();
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
    await etape('contacts', async () => { await p.goto(U + '#/contacts'); await p.locator('table.tableau tbody tr, .fiche-liste-ligne').first().waitFor(); });
    await etape('contact-fiche', async () => { await p.locator('table.tableau tbody tr, .fiche-liste-ligne').first().click(); });
    await etape('depenses', async () => { await p.goto(U + '#/depenses'); await p.getByRole('button', { name: 'Nouvelle dépense' }).waitFor(); });
    await etape('depense-ajoutee', async () => {
      await p.getByRole('button', { name: 'Nouvelle dépense' }).click();
      await p.getByLabel('Libellé').fill('Carburant livraison');
      await p.getByLabel('Montant').fill('7000');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Carburant livraison').waitFor();
    });
    await etape('tableau', async () => { await p.goto(U + '#/tableau-de-bord'); await p.getByText('Chiffre d’affaires').first().waitFor(); });
    await etape('tableau-30j', async () => { await p.getByRole('tab', { name: '30 jours' }).click(); await p.getByText('Chiffre d’affaires par jour').first().waitFor(); await p.getByText('À surveiller').first().waitFor(); });
    await etape('tableau-domaine', async () => {
      await p.goto(U + '#/tableau-de-bord/commerce');
      await p.getByText('Tableau Commerce').waitFor();
      await p.getByText('Encaissements par mode').first().waitFor();
    });
    await etape('indicateur-cliquable', async () => {
      // Un indicateur ouvre l'écran déjà filtré.
      await p.locator('.kpi.cliquable').first().click();
      await p.waitForFunction(() => !location.hash.startsWith('#/tableau-de-bord'), null, { timeout: 15000 });
    });
    await etape('parametres', async () => { await p.goto(U + '#/parametres'); await p.getByRole('tab', { name: 'Entreprise' }).waitFor(); });
    // Chaque module est ouvert par un profil de démonstration qui y a réellement accès.
    const changerProfil = async (profil) => {
      await p.evaluate(() => { localStorage.removeItem('ae-utilisateur-local'); localStorage.removeItem('ae-session-ouverte'); });
      await p.goto(U);
      await p.reload();
      await p.getByText(profil).first().click({ timeout: 90000 });
      await p.waitForTimeout(1500);
    };
    const modules = [
      ['Mireille', [['rapports', 'Rapports'], ['factures', 'Devis et factures'], ['achats', 'Achats'],
        ['crm', 'Prospects et opportunités'], ['projets', 'Projets'], ['employes', 'Employés'],
        ['presences', 'Présences'], ['conges', 'Congés'], ['agenda', 'Agenda'], ['support', 'Support'],
        ['abonnements', 'Abonnements'], ['fidelite', 'Fidélité'], ['documents', 'Documents']]],
      ['Gisèle', [['salle', 'Salle'], ['cuisine', 'Cuisine']]],
      ['Serge', [['hotel', 'Réception'], ['chambres', 'Chambres']]],
      ['Grâce', [['boutique', 'Boutique en ligne'], ['siteweb', 'Site web']]],
      ['Aline', [['locations', 'Locations'], ['biens', 'Biens'], ['maintenance', 'Maintenance']]],
    ];
    for (const [profil, pages] of modules) {
      await changerProfil(profil);
      for (const [route, titre] of pages) {
        await etape(`module-${route}`, async () => {
          await p.goto(`${U}#/${route}`);
          await p.getByRole('heading', { name: new RegExp(titre, 'i') }).first().waitFor({ timeout: 20000 });
          const erreursVisibles = await p.locator('.erreur:visible').allTextContents();
          if (erreursVisibles.length) throw new Error(erreursVisibles.join(' | '));
        });
      }
    }
    // Immobilier (profil encore ouvert : Aline) : impayé visible, quittance imprimable, échéancier d'un bail.
    await etape('immo-quittance', async () => {
      await p.goto(`${U}#/locations`);
      await p.getByRole('tab', { name: /Encaissements/ }).click();
      await p.locator('table.tableau tbody tr').first().click();
      await p.getByRole('heading', { name: /Quittance de loyer/ }).first().waitFor({ timeout: 20000 });
      await p.keyboard.press('Escape');
    });
    await etape('immo-bail', async () => {
      await p.goto(`${U}#/locations`);
      await p.getByRole('tab', { name: /Impayés/ }).click();
      await p.locator('table.tableau tbody tr').first().click();
      await p.getByRole('tab', { name: /Échéancier/ }).waitFor({ timeout: 20000 });
      await p.getByText(/Partielle|À payer/).first().waitFor();
    });
    await changerProfil('Mireille');
    await p.setViewportSize({ width: 390, height: 844 });
    await etape('mobile-caisse', async () => { await p.goto(U + '#/caisse'); await p.waitForTimeout(1000); });
    await etape('mobile-tableau', async () => { await p.goto(U + '#/tableau-de-bord'); await p.waitForTimeout(1000); });
  } catch (erreur) {
    erreurs.push(`PARCOURS ${erreur.message}`);
  }
  console.log(erreurs.join('\n') || 'aucune erreur console');
  await b.close();
  if (erreurs.length) process.exitCode = 1;
})();
