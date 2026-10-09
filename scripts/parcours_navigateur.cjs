// Parcours complet dans Chromium (Playwright requis) : npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_navigateur.cjs.
// Les captures vont dans captures-parcours/ (ignoré par Git).
require('node:fs').mkdirSync('captures-parcours', { recursive: true });
const { chromium } = require('playwright');
const U = process.env.URL_APP ?? 'http://localhost:4173/';
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
    await etape('caisse-attente', async () => {
      await p.getByRole('button', { name: 'Nouvelle vente' }).click();
      await p.getByPlaceholder('Nom, référence ou code-barres').fill('Casque test');
      await p.locator('button:has-text("Casque test")').first().click();
      await p.getByRole('button', { name: 'Mettre en attente' }).click();
      await p.getByLabel(/Nom pour la retrouver/).fill('Client en bleu');
      await p.getByRole('dialog').getByRole('button', { name: 'Mettre en attente' }).click();
      await p.getByRole('button', { name: 'En attente (1)' }).click();
      await p.getByText('Client en bleu').waitFor();
      await p.getByRole('button', { name: 'Reprendre' }).click();
      await p.locator('.panier-ligne', { hasText: 'Casque test' }).waitFor();
      // On la remet en attente : la clôture doit le signaler.
      await p.getByRole('button', { name: 'Mettre en attente' }).click();
      await p.getByRole('dialog').getByRole('button', { name: 'Mettre en attente' }).click();
      await p.getByRole('button', { name: 'En attente (1)' }).waitFor();
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
    await etape('cloture', async () => {
      await p.goto(U + '#/clotures');
      await p.getByLabel('Espèces comptées dans le tiroir').waitFor();
      await p.getByText(/1 vente\(s\) en attente sur cette caisse/).waitFor();
    });
    await etape('ticket-x', async () => {
      await p.getByRole('button', { name: 'Ticket X' }).click();
      await p.locator('.ticket-apercu').getByText('TICKET X · ÉTAT INTERMÉDIAIRE').waitFor();
      await p.keyboard.press('Escape');
    });
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
    await changerProfil('Mireille');
    // Confort : palette Ctrl+K (écran puis donnée), création rapide, export et impression d'une liste, thème sombre.
    await etape('palette-ecran', async () => {
      await p.goto(U + '#/tableau-de-bord');
      await p.getByText('Chiffre d’affaires').first().waitFor();
      await p.keyboard.press('Control+k');
      const champ = p.getByRole('combobox', { name: 'Rechercher partout' });
      await champ.fill('stock');
      // Entrée ouvre la ligne choisie : on attend que « Stock » soit en tête et sélectionné.
      await p.locator('[role="option"][aria-selected="true"]', { hasText: /^Stock/ }).waitFor();
      await champ.press('Enter');
      await p.waitForFunction(() => location.hash.startsWith('#/stock'));
    });
    await etape('palette-donnee', async () => {
      await p.getByRole('button', { name: /Rechercher partout/ }).click();
      await p.getByRole('combobox', { name: 'Rechercher partout' }).fill('Casque');
      await p.getByRole('option', { name: /Casque test/ }).first().click();
      await p.waitForFunction(() => location.hash.startsWith('#/articles?q=Casque'));
      await p.getByText('Casque test').first().waitFor();
    });
    await etape('creation-rapide', async () => {
      await p.getByRole('button', { name: 'Créer', exact: true }).click();
      await p.getByRole('combobox', { name: 'Que voulez-vous créer ?' }).fill('contact');
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => location.hash.startsWith('#/contacts?nouveau=1'));
      await p.getByRole('dialog').first().waitFor();
      await p.keyboard.press('Escape');
    });
    await etape('liste-export', async () => {
      await p.goto(U + '#/support');
      const [telechargement] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Exporter la liste/ }).first().click()]);
      if (!/\.csv$/.test(telechargement.suggestedFilename())) throw new Error('Export : fichier inattendu ' + telechargement.suggestedFilename());
    });
    await etape('balance-agee', async () => {
      await p.goto(U + '#/factures?onglet=retards');
      await p.getByText(/Plus de 90 j/).first().waitFor();
      const relancer = p.getByRole('button', { name: 'Relancer' }).first();
      if (await relancer.count()) {
        await relancer.click();
        await p.getByRole('dialog').getByText(/Total :/).first().waitFor().catch(() => {});
        await p.getByRole('dialog').locator('textarea').waitFor();
        await p.keyboard.press('Escape');
      }
    });
    await etape('assistant', async () => {
      await p.goto(U + '#/assistant');
      await p.getByRole('heading', { name: 'Assistant' }).first().waitFor();
      await p.getByText('À regarder').first().waitFor();
    });
    await etape('production', async () => {
      await p.goto(U + '#/production');
      await p.getByText('OF-00002').first().waitFor();
      await p.getByText('OF-00002').first().click();
      await p.getByRole('dialog').getByText('Composants nécessaires').waitFor();
      await p.getByRole('dialog').getByRole('button', { name: 'Terminer la fabrication' }).click();
      await p.getByText(/OF-00002 terminé/).first().waitFor();
      await p.getByRole('tab', { name: 'Recettes' }).click();
      await p.getByText('Panier garni (démo)').first().waitFor();
    });
    await etape('location', async () => {
      await p.goto(U + '#/location');
      await p.getByText('LC-00001').first().click();
      await p.getByRole('dialog').getByRole('button', { name: 'Enregistrer le retour' }).click();
      await p.getByRole('dialog').getByRole('button', { name: 'Valider le retour' }).click();
      await p.getByText(/LC-00001 rendu/).first().waitFor();
      await p.getByRole('tab', { name: 'Parc' }).click();
      await p.getByText('Tente de réception (démo)').first().waitFor();
    });
    await etape('livraisons', async () => {
      await p.goto(U + '#/livraisons');
      await p.getByText('LV-00002').first().click();
      await p.getByRole('dialog').getByRole('button', { name: 'Livrée' }).click();
      await p.getByRole('dialog').getByLabel('Reçue par').fill('Mme Démo');
      await p.getByRole('dialog').getByRole('button', { name: 'Confirmer la livraison' }).click();
      await p.getByText(/LV-00002 livrée/).first().waitFor();
      await p.goto(U + '#/livraisons?nouveau=1');
      await p.getByRole('dialog').getByLabel('Destinataire', { exact: true }).fill('Client E2E');
      await p.getByRole('dialog').getByLabel('Adresse', { exact: true }).fill('Rue du Test, Pointe-Noire');
      await p.getByRole('dialog').getByRole('button', { name: 'Créer la livraison' }).click();
      await p.getByText(/Livraison LV-00003 créée/).first().waitFor();
    });
    await etape('connexions', async () => {
      await p.goto(U + '#/parametres');
      await p.getByRole('tab', { name: 'Connexions' }).click();
      await p.getByText('Bac à sable Agence Elite').waitFor();
      await p.getByText(/Démonstration locale/).waitFor();
      if ((await p.locator('.carte.integration').count()) !== 11) throw new Error('11 services attendus');
    });
    await etape('export-listes-simples', async () => {
      for (const [ecran, nom] of [['articles', /^articles-/], ['contacts', /^contacts-/], ['depenses', /^depenses-/], ['clotures', /^tickets-z/]]) {
        await p.goto(U + '#/' + ecran);
        const bouton = p.getByRole('button', { name: 'Exporter', exact: true });
        await bouton.waitFor({ timeout: 60000 });
        const [telechargement] = await Promise.all([p.waitForEvent('download'), bouton.click()]);
        if (!nom.test(telechargement.suggestedFilename())) throw new Error(`Export ${ecran} : ${telechargement.suggestedFilename()}`);
      }
    });
    await etape('theme-sombre', async () => {
      await p.evaluate(() => localStorage.setItem('ae-affichage', JSON.stringify({ theme: 'sombre' })));
      await p.reload();
      await p.getByText('Chiffre d’affaires').first().waitFor({ timeout: 60000 }).catch(() => {});
      const theme = await p.evaluate(() => document.documentElement.dataset.theme);
      if (theme !== 'sombre') throw new Error('Thème sombre non appliqué');
      await p.evaluate(() => localStorage.removeItem('ae-affichage'));
    });
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
