// Parcours « nouveau client sans toucher au code », dans Chromium (Playwright requis) :
// npm run build:demo && npx vite preview --port 4173, puis node scripts/parcours_editeur.cjs.
// Agence Elite crée le client, l'établissement et la licence, invite le responsable, ouvre le mode support,
// puis vérifie l'espace éditeur sur téléphone (aucun débordement).
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
    await etape('editeur-connexion', async () => {
      await p.locator('button.profil', { hasText: 'Juste Glade' }).first().click({ timeout: 90000 });
      await p.getByRole('heading', { name: /Bonjour/ }).waitFor();
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
      await p.getByRole('tab', { name: 'Licence' }).click();
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
      await p.getByRole('button', { name: 'Inviter par e-mail' }).click();
      const d = dialogue();
      await d.getByLabel('Adresse e-mail').fill('responsable@pilote.test');
      await d.getByLabel('Rôle').selectOption('gerant');
      await d.getByRole('button', { name: 'Créer l’invitation' }).click();
      await d.getByLabel('Message à envoyer').waitFor();
    });
    await p.getByRole('button', { name: 'Terminé' }).click();
    await p.keyboard.press('Escape');
    // L'acceptation d'une invitation (création du compte) n'existe qu'avec la vraie base : elle est couverte par le
    // parcours « mot de passe obligatoire (Auth réel) » de la CI, pas par la démo locale.
    await etape('editeur-support', async () => {
      await p.getByRole('tab', { name: 'Support' }).click();
      await p.getByLabel('Motif (obligatoire)').fill('Vérification après mise en service');
      await p.getByRole('button', { name: 'Ouvrir et consulter' }).click();
      await p.getByText(/Mode support : consultation seule/).waitFor();
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
      await p.getByRole('heading', { name: /Bonjour/ }).waitFor();
      await p.waitForTimeout(800);
      const trop = await debordements();
      if (trop.length) throw new Error(`Débordement horizontal : ${trop.join(' | ')}`);
    });
    await etape('mobile-fiche-etablissement', async () => {
      await p.goto(`${U}#/editeur/clients`);
      await p.getByText('Pilote Fictif SARL').first().click();
      await p.getByRole('tab', { name: /Établissements/ }).click();
      await p.locator('main').getByText('Pilote Boutique Centre', { exact: true }).filter({ visible: true }).first().click();
      await p.getByRole('tab', { name: 'Licence' }).waitFor();
      const trop = await debordements();
      if (trop.length) throw new Error(`Débordement horizontal : ${trop.join(' | ')}`);
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
