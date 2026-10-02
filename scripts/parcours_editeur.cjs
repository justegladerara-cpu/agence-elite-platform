// Parcours « nouveau client sans toucher au code », dans Chromium (Playwright requis) :
// npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_editeur.cjs.
// Agence Elite crée le client, l'établissement et la licence, invite le responsable ;
// celui-ci configure, importe ses articles, invite son caissier, qui vend.
const { chromium } = require('playwright');
const fs = require('node:fs');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
fs.mkdirSync('captures-parcours', { recursive: true });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(`PAGEERROR ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('CERT')) erreurs.push(m.text()); });
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
  const changerProfil = async () => {
    await p.getByRole('button', { name: /Changer de (profil|compte)/ }).click();
    await p.getByText('Choisissez un profil de démonstration').waitFor();
  };
  const connexionEmail = async (email) => {
    await p.getByLabel(/Entrez votre adresse e-mail/).fill(email);
    await p.getByRole('button', { name: 'Se connecter' }).click();
  };
  const dialogue = () => p.getByRole('dialog').last();

  try {
    await p.goto(U);
    await etape('editeur-connexion', async () => {
      await p.getByText('Agence Elite (éditeur)').click({ timeout: 90000 });
      await p.getByRole('heading', { name: 'Agence Elite' }).waitFor();
    });
    await etape('client-cree', async () => {
      await p.getByRole('button', { name: 'Nouveau client' }).first().click();
      await dialogue().getByLabel(/Nom du client/).fill('Pilote Fictif SARL');
      await dialogue().getByLabel('Responsable').fill('Mme Responsable Fictive');
      await dialogue().getByLabel('Téléphone').fill('+242 06 000 00 01');
      await dialogue().getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByRole('heading', { name: 'Pilote Fictif SARL' }).waitFor();
    });
    await etape('etablissement-cree', async () => {
      await p.getByRole('button', { name: 'Nouvel établissement' }).click();
      await dialogue().getByLabel('Nom de l’établissement').fill('Pilote Boutique Centre');
      await dialogue().getByLabel('Ville').fill('Pointe-Noire');
      await dialogue().getByRole('button', { name: 'Créer' }).click();
      await p.getByRole('tab', { name: 'Licence' }).waitFor();
    });
    await etape('licence-attribuee', async () => {
      await p.getByRole('button', { name: 'Attribuer une licence' }).click();
      const d = dialogue();
      await d.getByLabel('Offre').selectOption('commerce-complet');
      await d.getByLabel('Formule').selectOption('mensuel');
      await d.getByLabel(/Montant encaissé/).fill('25000');
      await d.getByLabel('Référence du paiement').fill('MoMo test 001');
      await d.getByRole('button', { name: 'Attribuer', exact: true }).click();
      await p.getByText('MoMo test 001').waitFor();
    });
    await etape('gerant-invite', async () => {
      await p.getByRole('tab', { name: 'Équipe' }).click();
      await p.getByRole('button', { name: 'Inviter une personne' }).click();
      const d = dialogue();
      await d.getByLabel('Adresse e-mail').fill('responsable@pilote.test');
      await d.getByLabel('Rôle').selectOption('gerant');
      await d.getByRole('button', { name: 'Créer l’invitation' }).click();
      await d.getByLabel('Message à envoyer').waitFor();
    });
    await p.getByRole('button', { name: 'Terminé' }).click();
    await p.keyboard.press('Escape');
    await changerProfil();

    await etape('responsable-invitation', async () => {
      await connexionEmail('responsable@pilote.test');
      await p.getByText('Vous êtes invité(e) à rejoindre :').waitFor();
    });
    await etape('responsable-rejoint', async () => {
      await p.getByLabel(/Votre nom/).fill('Mme Responsable Fictive');
      await p.getByRole('button', { name: 'Rejoindre' }).click();
      await p.getByRole('heading', { name: 'Mise en service' }).waitFor();
    });
    await etape('identite', async () => {
      await p.goto(`${U}#/parametres`);
      await p.getByLabel('Adresse').fill('Avenue de test, Pointe-Noire');
      await p.getByLabel('Téléphone').fill('+242 06 000 00 02');
      await p.getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('Identité enregistrée').waitFor();
    });
    await etape('caissier-invite', async () => {
      await p.goto(`${U}#/equipe`);
      await p.getByRole('button', { name: 'Inviter une personne' }).click();
      const d = dialogue();
      await d.getByLabel('Adresse e-mail').fill('caisse@pilote.test');
      await d.getByRole('button', { name: 'Créer l’invitation' }).click();
      await d.getByLabel('Message à envoyer').waitFor();
      await p.getByRole('button', { name: 'Terminé' }).click();
    });
    await etape('import-articles', async () => {
      await p.goto(`${U}#/articles`);
      await p.getByRole('button', { name: 'Importer' }).click();
      const csv = 'nom;prix_vente;cout_achat;categorie;reference;stock_initial;stock_minimum\n'
        + 'Savon de ménage;500;300;Entretien;ENT-1;48;10\n'
        + 'Riz 5 kg;4500;3800;Alimentation;ALI-1;20;5\n'
        + '"Huile 1 L, bouteille";1800;1400;Alimentation;ALI-2;30;6\n';
      await p.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'articles.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await p.getByText('3 article(s) lus').waitFor();
      await dialogue().getByRole('button', { name: 'Importer' }).click();
      await p.getByText('3 article(s) créé(s)').waitFor();
    });
    await etape('mise-en-service', async () => {
      await p.goto(`${U}#/mise-en-service`);
      await p.getByRole('button', { name: 'Déclarer la mise en service' }).click();
      await p.getByText(/En service depuis/).waitFor();
    });
    await changerProfil();

    await etape('caissier-rejoint', async () => {
      await connexionEmail('caisse@pilote.test');
      await p.getByLabel(/Votre nom/).fill('M. Caissier Fictif');
      await p.getByRole('button', { name: 'Rejoindre' }).click();
      await p.getByRole('button', { name: 'Ouvrir la caisse' }).waitFor();
    });
    await etape('caissier-vend', async () => {
      await p.goto(`${U}#/caisse`);
      await p.locator('.ouverture-caisse button[type=submit]').click();
      await p.getByPlaceholder('Nom, référence ou code-barres').fill('Riz');
      await p.locator('button:has-text("Riz 5 kg")').first().click();
      await p.getByRole('button', { name: /Encaisser/ }).click();
      await p.getByRole('button', { name: 'Compte juste' }).click();
      await p.getByRole('button', { name: 'Valider la vente' }).click();
      await p.getByText(/Reçu V-00001/).waitFor();
    });
    await p.getByRole('button', { name: 'Nouvelle vente' }).click();
    await p.goto(`${U}#/tableau-de-bord`);
    await changerProfil();

    await etape('editeur-suivi', async () => {
      await p.getByText('Agence Elite (éditeur)').click();
      await p.getByRole('button', { name: /Pilote Fictif SARL/ }).click();
      await p.getByText('en service').first().waitFor();
    });
    await etape('editeur-droits-caissier', async () => {
      await p.getByRole('button', { name: /Pilote Boutique Centre/ }).click();
      await p.getByRole('tab', { name: 'Équipe' }).click();
      await p.getByRole('row', { name: /caisse@pilote.test/ }).getByRole('button', { name: 'Modifier' }).click();
      await p.getByRole('dialog', { name: 'M. Caissier Fictif' }).getByText('ajusté').count();
      await p.getByRole('dialog', { name: 'M. Caissier Fictif' }).getByLabel(/articles.gerer|Créer et modifier/).first().check();
      await p.getByRole('dialog', { name: 'M. Caissier Fictif' }).getByRole('button', { name: 'Enregistrer' }).click();
      await p.getByText('droits ajustés').waitFor();
    });
    await etape('editeur-support', async () => {
      await p.getByRole('tab', { name: 'Support' }).click();
      await p.getByLabel('Motif (obligatoire)').fill('Vérification après mise en service');
      await p.getByRole('button', { name: 'Ouvrir et consulter' }).click();
      await p.getByText(/Mode support : consultation seule/).waitFor();
      await p.getByText('Chiffre d’affaires').waitFor();
    });
    await etape('editeur-support-ventes', async () => {
      await p.goto(`${U}#/ventes`);
      await p.getByText('V-00001').first().waitFor();
    });
    await p.setViewportSize({ width: 390, height: 844 });
    const debordements = () => p.evaluate(() => {
      const largeur = document.documentElement.clientWidth;
      return [...document.querySelectorAll('main *')]
        .filter((e) => e.getBoundingClientRect().right > largeur + 1 && !e.closest('.tableau-conteneur'))
        .slice(0, 8)
        .map((e) => `${e.tagName}.${e.className} droite=${Math.round(e.getBoundingClientRect().right)}`);
    });
    await etape('mobile-editeur', async () => {
      await p.goto(`${U}#/editeur`);
      await p.getByRole('heading', { name: 'Agence Elite' }).waitFor();
      await p.waitForTimeout(800);
      const trop = await debordements();
      if (trop.length) throw new Error(`Débordement horizontal : ${trop.join(' | ')}`);
    });
    await etape('mobile-fiche-etablissement', async () => {
      await p.getByRole('button', { name: /Pilote Boutique Centre/ }).click();
      await p.getByRole('tab', { name: 'Licence' }).waitFor();
    });
  } catch {
    process.exitCode = 1;
  }
  console.log(erreurs.join('\n') || 'aucune erreur console');
  await b.close();
})();
