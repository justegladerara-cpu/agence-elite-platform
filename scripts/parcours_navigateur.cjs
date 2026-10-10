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
    await etape('scolaire', async () => {
      await p.goto(U + '#/scolaire?paiement=impaye');
      await p.getByText('Démo Élève Un').first().click();
      await p.getByRole('dialog').getByRole('button', { name: 'Encaisser' }).click();
      await p.getByText(/Reçu RS-00002/).first().waitFor();
      await p.getByRole('tab', { name: 'Classes' }).click();
      await p.getByText('CE1 (démo)').first().waitFor();
    });
    await etape('comptabilite', async () => {
      await p.goto(U + '#/comptabilite');
      await p.getByRole('button', { name: /Générer les écritures \(\d+\)/ }).click();
      await p.getByText(/écriture\(s\) générée\(s\)/).first().waitFor();
      await p.getByRole('tab', { name: 'Balance' }).click();
      await p.getByText(/Les deux sont toujours égaux/).waitFor();
      await p.getByRole('tab', { name: 'Plan comptable' }).click();
      await p.getByText('Comptes utilisés par les écritures automatiques').waitFor();
    });
    await etape('marketing', async () => {
      await p.goto(U + '#/marketing?statut=brouillon');
      await p.getByText('Nouveautés du mois (démo)').first().click();
      await p.getByRole('dialog').getByRole('button', { name: 'Préparer les destinataires' }).click();
      await p.getByText(/1 destinataire\(s\) retenu\(s\)/).first().waitFor();
      await p.goto(U + '#/marketing?statut=prete');
      await p.getByText('Nouveautés du mois (démo)').first().click();
      await p.getByRole('dialog').getByText(/Bloqué :/).waitFor();
      await p.getByRole('dialog').getByRole('button', { name: 'Déclarer l’envoi fait' }).click();
      await p.getByRole('dialog').getByRole('textbox').fill('Envoyé depuis le téléphone de la boutique');
      await p.getByRole('dialog').getByRole('button', { name: 'Déclarer envoyée' }).click();
      await p.getByText('Campagne déclarée envoyée').first().waitFor();
    });
    await etape('support-avance', async () => {
      await p.goto(U + '#/support/bibliotheque');
      await p.getByText('Changer le rouleau de l\'imprimante de caisse').first().waitFor();
      await p.goto(U + '#/support?etat=actifs');
      await p.getByText('Commande de l\'hôtel incomplète').first().click();
      await p.getByRole('combobox', { name: 'Réponse type' }).selectOption({ label: 'Livraison incomplète' });
      await p.getByRole('button', { name: 'Escalader' }).click();
      await p.getByRole('dialog').getByRole('textbox').fill('Le client attend la livraison aujourd\'hui');
      await p.getByRole('dialog').getByRole('button', { name: 'Valider' }).click();
      await p.getByText('Ticket escaladé').first().waitFor();
      await p.getByText(/Escaladé ×1/).first().waitFor();
    });
    await etape('devis-contrats', async () => {
      await p.goto(U + '#/contrats?vue=registre');
      await p.getByText('Approvisionnement en riz : prix garantis').first().waitFor();
      await p.getByRole('cell').getByText('Préavis à envoyer').first().waitFor();
      await p.goto(U + '#/contrats');
      await p.getByText('Eau minérale pour les chambres : livraison mensuelle').first().click();
      await p.getByText(/Avenant 1 · Ajout de l'eau gazeuse/).first().waitFor();
      await p.getByRole('button', { name: 'Ajouter un avenant' }).click();
      await p.getByRole('dialog').getByRole('textbox', { name: 'Objet de l’avenant' }).fill('Livraison le samedi incluse');
      await p.getByRole('dialog').getByRole('button', { name: 'Ajouter l’avenant' }).click();
      await p.getByText(/Avenant 2 · Livraison le samedi incluse/).first().waitFor();
      await p.goto(U + '#/factures?onglet=devis');
      await p.getByText(/-V2$/).first().click();
      await p.getByText('Acompte à la commande').first().waitFor();
      await p.getByRole('checkbox', { name: /Livraison le samedi/ }).click();
      await p.getByText('Option retenue').first().waitFor();
      await p.getByRole('button', { name: 'Comparer' }).click();
      await p.getByRole('dialog').getByText('Remise globale').waitFor();
      await p.keyboard.press('Escape');
    });
    await etape('projets-avances', async () => {
      await p.goto(U + '#/projets');
      await p.getByText('Mini-boutique du hall de l\'hôtel').first().click();
      await p.getByText('Attend : Installer le présentoir').first().waitFor();
      await p.getByRole('tab', { name: 'Suivi et livrables' }).click();
      await p.getByText('Plan du présentoir').first().waitFor();
      await p.getByRole('checkbox', { name: /Prix affichés sur chaque produit/ }).click();
      await p.getByText(/1 \/ 3 fait/).first().waitFor();
      await p.getByRole('button', { name: 'Valider', exact: true }).click();
      await p.getByRole('dialog').getByRole('textbox').fill('M. Ibara');
      await p.getByRole('dialog').getByRole('button', { name: 'Valider' }).click();
      await p.getByText('Livrable validé').first().waitFor();
    });
    await etape('qualification-crm', async () => {
      await p.goto(U + '#/crm');
      await p.getByText('Fournitures de la cantine (trimestre)').first().click();
      await p.getByText('Score 75 %').first().waitFor();
      await p.getByText('M. Ibara').first().waitFor();
      await p.getByRole('group', { name: 'Le délai de décision est connu' }).getByRole('button', { name: 'Oui' }).click();
      await p.getByRole('button', { name: 'Enregistrer les réponses' }).click();
      await p.getByText('Score 100 %').first().waitFor();
      await p.goto(U + '#/crm');
      await p.getByText('Produits d\'hygiène pour le salon').first().click();
      await p.getByRole('button', { name: 'Plus d’actions' }).click();
      await p.getByText('Marquer perdue').first().click();
      const d = p.getByRole('dialog', { name: 'Opportunité perdue' });
      await d.getByRole('button', { name: 'Pas de budget' }).click();
      await d.getByRole('combobox').selectOption('90');
      await d.getByRole('button', { name: 'Marquer perdue' }).click();
      await p.getByText('Opportunité perdue, relance planifiée').first().waitFor();
      await p.getByText(/Pas de budget/).first().waitFor();
      await p.goto(U + '#/crm?vue=doublons');
      await p.getByText(/Aucun doublon repéré|groupe\(s\) à vérifier/).first().waitFor();
    });
    await etape('tresorerie', async () => {
      await p.goto(U + '#/factures?onglet=retards');
      await p.getByText('Contesté').first().waitFor();
      await p.getByRole('tab', { name: /Relevé client/ }).click();
      await p.getByLabel('Client').selectOption({ label: 'École Démo Les Palmiers' });
      await p.getByText(/Crédit client disponible/).first().waitFor();
      await p.goto(U + '#/factures');
      await p.getByPlaceholder('Numéro, client ou objet').fill('Eau minérale');
      await p.getByText('Hôtel Démo Côte Sauvage').first().click();
      await p.getByRole('button', { name: 'Encaisser' }).click();
      const d = p.getByRole('dialog');
      const reste = Number(await d.getByLabel('Montant').inputValue());
      await d.getByLabel('Montant').fill(String(reste + 1000));
      await d.getByText(/deviendra un crédit client/).waitFor();
      await d.getByRole('button', { name: 'Enregistrer le paiement' }).click();
      await p.getByText(/mis en crédit client/).first().waitFor();
      await p.getByText('Crédits du client').first().waitFor();
      await p.goto(U + '#/depenses');
      await p.getByText('Réparation du congélateur').first().waitFor();
      await p.getByRole('button', { name: 'Valider', exact: true }).click();
      await p.getByText('Dépense validée et enregistrée').first().waitFor();
    });
    await etape('donnees-personnelles', async () => {
      await p.goto(U + '#/factures');
      await p.getByPlaceholder('Numéro, client ou objet').fill('Approvisionnement du mois dernier');
      await p.locator('tbody tr').first().click();
      await p.getByText('Bon de livraison signé.pdf').first().waitFor();
      await p.getByRole('button', { name: 'Partager', exact: true }).click();
      const d = p.getByRole('dialog');
      await d.getByRole('button', { name: 'Créer le lien' }).click();
      const adresse = await d.getByLabel('Lien de partage').inputValue();
      if (!/#\/partage\/[0-9a-f]{64}$/.test(adresse)) throw new Error('Lien de partage inattendu : ' + adresse);
      await p.keyboard.press('Escape');
      const facture = p.url();
      await p.goto(adresse);
      await p.getByText('Télécharger le document').waitFor({ timeout: 60000 });
      await p.goto(facture);
      await p.getByRole('button', { name: 'Partager', exact: true }).click();
      await p.getByRole('dialog').getByRole('button', { name: 'Révoquer' }).first().click();
      await p.getByRole('dialog').getByText('Liens actifs').waitFor({ state: 'detached' });
      await p.goto(adresse);
      await p.getByText(/n’existe pas ou a expiré/).waitFor({ timeout: 60000 });
      await p.goto(U + '#/contacts');
      await p.getByText('M. Ibara (économat)').first().click();
      const [fichier] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exporter ses données' }).click()]);
      if (!/^donnees-contact-/.test(fichier.suggestedFilename())) throw new Error('Export contact : ' + fichier.suggestedFilename());
    });
    await etape('pilotage', async () => {
      await p.goto(U + '#/pilotage');
      await p.getByLabel('Période').selectOption('annee');
      await p.getByRole('heading', { name: 'Rentabilité par client' }).waitFor();
      await p.locator('tbody tr').first().waitFor();
      await p.getByRole('tab', { name: 'Par canal' }).click();
      await p.getByRole('heading', { name: 'Par canal d’acquisition' }).waitFor();
      await p.getByRole('tab', { name: 'Prévision' }).click();
      await p.getByRole('columnheader', { name: 'Pondéré' }).waitFor();
      await p.getByRole('tab', { name: /Charge par personne/ }).click();
      await p.getByRole('heading', { name: 'Charge par personne' }).waitFor();
      await p.getByRole('tab', { name: /Engagements à risque/ }).click();
      await p.getByRole('heading', { name: 'Engagements à risque' }).waitFor();
    });
    await etape('espace-client', async () => {
      await p.goto(U + '#/espace-client');
      await p.getByText('Hôtel Démo Côte Sauvage').first().click();
      await p.getByText(/deuxième présentoir/).first().waitFor();
      await p.getByRole('tab', { name: /Journal/ }).click();
      await p.getByText('A consulté un document').first().waitFor();
      await p.getByRole('button', { name: 'Nouveau lien' }).click();
      const d = p.getByRole('dialog');
      await d.getByRole('button', { name: 'Créer le lien' }).click();
      const adresse = await d.getByLabel('Lien de l’espace client').inputValue();
      if (!/#\/espace\/[0-9a-f]{64}$/.test(adresse)) throw new Error('Lien d’espace client inattendu : ' + adresse);
      await p.keyboard.press('Escape');
      const fiche = p.url();
      await p.goto(adresse);
      await p.getByRole('heading', { name: /Espace de Hôtel Démo Côte Sauvage/ }).waitFor({ timeout: 60000 });
      await p.getByRole('tab', { name: 'Projets' }).click();
      await p.getByText(/Mini-boutique du hall/).first().waitFor();
      await p.getByRole('tab', { name: 'Messages' }).click();
      await p.getByLabel('Votre message').fill('Merci, nous attendons le devis.');
      await p.getByRole('button', { name: 'Envoyer', exact: true }).click();
      await p.getByText('Merci, nous attendons le devis.').waitFor();
      await p.goto(fiche);
      await p.getByText('Merci, nous attendons le devis.').first().waitFor({ timeout: 60000 });
    });
    await etape('espace-client-rdv', async () => {
      await p.goto(U + '#/espace-client');
      await p.getByText('Hôtel Démo Côte Sauvage').first().click();
      await p.getByRole('tab', { name: /Journal/ }).click();
      await p.getByText('A pris rendez-vous').first().waitFor();
      await p.getByRole('button', { name: 'Nouveau lien' }).click();
      const d = p.getByRole('dialog');
      await d.getByRole('button', { name: 'Créer le lien' }).click();
      const adresse = await d.getByLabel('Lien de l’espace client').inputValue();
      await p.keyboard.press('Escape');
      await p.goto(adresse);
      await p.getByRole('heading', { name: /Espace de Hôtel Démo Côte Sauvage/ }).waitFor({ timeout: 60000 });
      await p.getByRole('tab', { name: 'Rendez-vous' }).click();
      await p.getByText('Rendez-vous demandé en ligne').first().waitFor();
      await p.getByRole('button', { name: 'Je confirme' }).first().click();
      await p.getByText('Merci, votre présence est confirmée.').waitFor();
      await p.getByRole('button', { name: 'Prendre rendez-vous' }).click();
      const choix = p.getByRole('dialog');
      await choix.getByRole('group', { name: 'Heures libres' }).getByRole('button').first().click();
      await p.getByText('Rendez-vous demandé : l’équipe est prévenue.').waitFor();
      await p.getByRole('tab', { name: 'Aide' }).click();
      await p.getByText('Délais de livraison et d’installation').or(p.getByText("Délais de livraison et d'installation")).first().click();
      await p.getByText(/livrés et installés sous 5 jours/).waitFor();
      await p.goto(U + '#/agenda?vue=liste');
      await p.getByText('Pris en ligne').first().waitFor({ timeout: 60000 });
    });
    await etape('recadrage-photo', async () => {
      // Photo fictive 400 × 300 (PNG fabriqué ici) : le justificatif d'une dépense se recadre avant l'enregistrement.
      const zlib = require('node:zlib');
      const crc = (b) => { let c = ~0; for (const o of b) { c ^= o; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
      const bloc = (type, data) => { const t = Buffer.from(type); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
      const L = 400; const H = 300; const brut = Buffer.alloc((L * 3 + 1) * H);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < L; x += 1) { const o = y * (L * 3 + 1) + 1 + x * 3; brut[o] = x % 256; brut[o + 1] = y % 256; brut[o + 2] = 160; }
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
      const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
      await p.goto(U + '#/depenses');
      await p.getByRole('button', { name: 'Nouvelle dépense' }).click();
      const d = p.getByRole('dialog');
      await d.locator('input[type=file]').setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: png });
      await d.getByRole('group', { name: 'Recadrer la photo' }).waitFor();
      await d.getByRole('button', { name: 'Coin haut gauche' }).focus();
      for (let k = 0; k < 5; k += 1) await p.keyboard.press('ArrowRight');
      await d.getByText('Zone gardée : 90 % × 100 % de la photo.').waitFor();
      await d.getByRole('button', { name: 'Valider le recadrage' }).click();
      await d.getByRole('group', { name: 'Recadrer la photo' }).waitFor({ state: 'detached' });
      // La vignette non recadrée (400 px) est déjà affichée : attendre que l'image recadrée (360 px) la remplace.
      await p.waitForFunction(() => document.querySelector('img[alt="Justificatif"]')?.naturalWidth === 360, null, { timeout: 15000 })
        .catch(async () => { throw new Error('Recadrage inattendu : largeur ' + await d.getByRole('img', { name: 'Justificatif' }).evaluate((i) => i.naturalWidth)); });
      await d.getByRole('button', { name: 'Annuler', exact: true }).last().click();
    });
    await etape('propositions-parrainage-bilan', async () => {
      // Proposition adaptée au besoin : le modèle « Fournitures de collectivité » est proposé pour la cantine du collège.
      await p.goto(U + '#/crm');
      await p.getByText('Fournitures de la cantine (trimestre)').first().click();
      const propositions = p.locator('section', { has: p.getByRole('heading', { name: 'Propositions adaptées' }) });
      const ligne = propositions.locator('.liste-ligne', { hasText: 'Fournitures de collectivité' });
      await ligne.getByText(/besoin : cantine, fournitures/).waitFor({ timeout: 60000 });
      await ligne.getByRole('button', { name: 'Créer le devis' }).click();
      await p.waitForURL(/#\/factures\/[0-9a-f-]+\/modifier/, { timeout: 60000 });
      await p.waitForFunction(() => [...document.querySelectorAll('input, textarea')].some((e) => e.value.includes('Denrées de cantine')), null, { timeout: 30000 })
        .catch(() => { throw new Error('Lignes du modèle absentes du devis'); });
      // Parrainage : la recommandation de l'hôtel est suivie dans Fidélité.
      await p.goto(U + '#/fidelite');
      const parrainage = p.locator('section', { has: p.getByRole('heading', { name: 'Parrainage' }) });
      await parrainage.getByText('Collège Démo Saint-Joseph').first().waitFor({ timeout: 60000 });
      await parrainage.getByText('En attente').first().waitFor();
      // Maintenance planifiée annoncée sur la page Support.
      await p.goto(U + '#/support');
      await p.getByText('Inventaire annuel : magasin fermé').first().waitFor({ timeout: 60000 });
      // Espace du client : annonce de maintenance, bilan publié (lu), recommandation.
      await p.goto(U + '#/espace-client');
      await p.getByText('Hôtel Démo Côte Sauvage').first().click();
      await p.getByRole('tab', { name: 'Bilans' }).click();
      await p.getByText(/pas encore lu/).first().waitFor();
      await p.getByRole('button', { name: 'Nouveau lien' }).click();
      const d = p.getByRole('dialog');
      await d.getByRole('button', { name: 'Créer le lien' }).click();
      const adresse = await d.getByLabel('Lien de l’espace client').inputValue();
      await p.keyboard.press('Escape');
      const fiche = p.url();
      await p.goto(adresse);
      await p.getByRole('heading', { name: /Espace de Hôtel Démo Côte Sauvage/ }).waitFor({ timeout: 60000 });
      await p.getByText(/Maintenance prévue .* Inventaire annuel : magasin fermé/).first().waitFor();
      await p.getByText(/1 bilan à lire/).first().waitFor();
      await p.getByRole('tab', { name: 'Bilans' }).click();
      await p.getByRole('button', { name: /^Bilan du / }).first().click();
      await p.getByText(/Ajouter un deuxième présentoir/).first().waitFor();
      await p.getByRole('tab', { name: 'Recommander' }).click();
      await p.getByText(/Livraison offerte sur la prochaine commande/).first().waitFor();
      await p.getByText('Collège Démo Saint-Joseph').first().waitFor();
      await p.getByLabel('Nom de la personne ou de l’entreprise').fill('Pharmacie Démo du Port');
      await p.getByLabel('Téléphone').fill('+242 06 000 00 99');
      await p.getByRole('button', { name: 'Recommander' }).click();
      await p.getByText('Merci : votre recommandation est transmise à l’équipe.').waitFor();
      await p.getByText('Pharmacie Démo du Port').first().waitFor();
      await p.goto(fiche);
      await p.getByRole('tab', { name: 'Bilans' }).click({ timeout: 60000 });
      await p.getByText(/lu par le client le/).first().waitFor();
    });
    await etape('devise-rapprochement-tresorerie', async () => {
      // Taux de change saisis : historique visible dans Devis et factures.
      await p.goto(U + '#/factures?onglet=taux');
      await p.getByText('Taux de démonstration').first().waitFor({ timeout: 60000 });
      // Devis présenté aussi dans la devise du client, au taux figé sur le document.
      await p.goto(U + '#/factures?onglet=devis');
      await p.getByText('DE-00001-V2').first().click();
      await p.getByText(/^Soit .+/).first().waitFor({ timeout: 60000 });
      await p.getByText(/au .*\(Taux de démonstration\)/).first().waitFor();
      // Rapprochement : la ligne du relevé retrouve le paiement Mobile Money par sa référence.
      await p.goto(U + '#/rapprochement');
      const ligneReleve = p.locator('section').filter({ hasText: 'MM-DEMO-001' }).last();
      await ligneReleve.getByText('Référence retrouvée').first().waitFor({ timeout: 60000 });
      await ligneReleve.getByRole('button', { name: 'Rapprocher' }).first().click();
      await p.getByText('Ligne rapprochée').first().waitFor({ timeout: 30000 });
      await p.locator('section').filter({ hasText: 'MM-DEMO-001' }).first().waitFor({ state: 'detached', timeout: 30000 });
      // Trésorerie prévue : trois scénarios dans le Pilotage.
      await p.goto(U + '#/pilotage?vue=tresorerie');
      await p.getByText('Prudent : fin de période').first().waitFor({ timeout: 60000 });
      await p.getByText('Optimiste : fin de période').first().waitFor();
    });

    await etape('stock-simplifie', async () => {
      // « J'ai reçu de la marchandise » : une page, une quantité par article, un seul bouton. Pas de code-barres.
      await p.goto(U + '#/stock');
      await p.getByRole('button', { name: 'J’ai reçu de la marchandise' }).click({ timeout: 60000 });
      await p.getByLabel('Chercher un article').fill('sucre');
      await p.getByLabel('Reçu : Sucre en poudre 1 kg').fill('10');
      await p.getByRole('button', { name: 'Ajouter au stock' }).click();
      await p.getByText('Stock ajouté : 1 article(s)').first().waitFor({ timeout: 30000 });
      // « Je compte mon stock » rempli depuis un fichier au format du modèle (catégorie facultative).
      await p.getByRole('button', { name: 'Je compte mon stock' }).click();
      const [modele] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Télécharger le modèle de fichier' }).click()]);
      if (modele.suggestedFilename() !== 'modele-stock.csv') throw new Error('modèle de fichier de stock absent');
      await p.getByLabel('Fichier de stock').setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from('nom;categorie;quantite\nSucre en poudre 1 kg;Épicerie;5\nBougies (paquet de 10);;7\n') });
      await p.getByText(/2 ligne\(s\) lue\(s\) : 2 article\(s\) existant\(s\) rempli\(s\)/).first().waitFor({ timeout: 30000 });
      await p.getByRole('button', { name: 'Enregistrer le comptage' }).click();
      await p.getByText(/Comptage enregistré : 2 article\(s\)/).first().waitFor({ timeout: 30000 });
      // Perte ou casse : « Retirer », avec une raison.
      await p.getByRole('row').filter({ hasText: 'Bougies (paquet de 10)' }).getByRole('button', { name: 'Retirer' }).click();
      await p.getByLabel('Quantité retirée').fill('1');
      await p.getByLabel('Raison', { exact: true }).fill('Casse');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText(/Bougies \(paquet de 10\) : 6/).first().waitFor({ timeout: 30000 });
    });

    await etape('stock-casiers', async () => {
      // Boissons en casiers : l'article déclare son casier ; on reçoit en casiers + unités, le stock s'affiche pareil.
      await p.goto(U + '#/articles');
      await p.getByRole('button', { name: 'Nouvel article' }).click({ timeout: 60000 });
      await p.getByLabel('Nom de l’article').fill('Bière test 33 cl');
      await p.getByLabel('Prix de vente').fill('1000');
      await p.getByLabel(/Suivre les quantités de cet article/).check();
      await p.getByLabel(/Unités par casier/).fill('24');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Bière test 33 cl').first().waitFor({ timeout: 30000 });
      await p.goto(U + '#/stock');
      await p.getByRole('button', { name: 'J’ai reçu de la marchandise' }).click({ timeout: 60000 });
      await p.getByLabel('Chercher un article').fill('Bière test');
      await p.getByLabel('Reçu en casiers de 24 : Bière test 33 cl').fill('2');
      await p.getByLabel('Reçu à l’unité : Bière test 33 cl').fill('3');
      await p.getByRole('row').filter({ hasText: 'Bière test 33 cl' }).getByText('2 casiers + 3').waitFor({ timeout: 10000 });
      await p.getByRole('button', { name: 'Ajouter au stock' }).click();
      await p.getByText('Stock ajouté : 1 article(s)').first().waitFor({ timeout: 30000 });
      await p.getByRole('row').filter({ hasText: 'Bière test 33 cl' }).getByText('2 casiers + 3').first().waitFor({ timeout: 30000 });
    });

    await etape('fermeture-caisse-reglage', async () => {
      // Heure de fin de journée de la caisse : minuit par défaut, réglable (bar de nuit), heure invalide refusée.
      await p.goto(U + '#/parametres?onglet=reglages');
      const champ = p.getByLabel(/Fermeture automatique de la caisse chaque jour/);
      await champ.waitFor({ timeout: 60000 });
      if ((await champ.inputValue()) !== '00:00') throw new Error('minuit attendu par défaut');
      await champ.fill('04:00');
      await champ.locator('xpath=ancestor::form').getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText(/Réglages .* enregistrés/).first().waitFor({ timeout: 30000 });
      await champ.fill('00:00');
      await champ.locator('xpath=ancestor::form').getByRole('button', { name: 'Enregistrer' }).click();
      await p.goto(U + '#/clotures');
      await p.getByText('Tickets Z').first().waitFor({ timeout: 60000 });
    });

    await etape('ventes-jour-passe', async () => {
      // Le gérant saisit après coup deux ventes d'hier ; la caisse de ce jour est fermée avec son ticket Z.
      await p.goto(U + '#/clotures');
      await p.getByRole('button', { name: 'Ventes d’un jour passé' }).click({ timeout: 60000 });
      await p.getByLabel('Article (vente 1)').selectOption({ label: 'Sucre en poudre 1 kg' });
      await p.getByLabel('Quantité (vente 1)').fill('2');
      await p.getByRole('button', { name: 'Ajouter une vente' }).click();
      await p.getByLabel('Article (vente 2)').selectOption({ label: 'Bougies (paquet de 10)' });
      await p.getByLabel('Paiement (vente 2)').selectOption('mobile_money');
      await p.getByLabel('Pourquoi après coup ?').fill('Coupure d’électricité');
      await p.getByRole('button', { name: 'Enregistrer et fermer la caisse de ce jour' }).click();
      await p.getByText(/2 vente\(s\) enregistrée\(s\), caisse du .* fermée : Z-/).first().waitFor({ timeout: 30000 });
      await p.locator('.ticket-apercu').getByText(/Saisie après coup du/).waitFor();
      await p.keyboard.press('Escape');
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
  // En CI, chaque erreur devient une annotation GitHub (lisible sans télécharger le journal).
  if (process.env.GITHUB_ACTIONS) for (const e of erreurs) console.log(`::error title=Parcours navigateur::${e.replace(/[\r\n]+/g, ' ').slice(0, 900)}`);
  await b.close();
  if (erreurs.length) process.exitCode = 1;
})();
