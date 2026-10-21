// Elite UX 2.0 : captures et contrôles de lisibilité sur la démo locale (données fictives, base dans le navigateur).
// npm run build:demo && npx vite preview --port 4173, puis :
//   CHROMIUM_PATH=… DOSSIER=captures-ux/avant [PROFIL=Serge ECRANS=hotel,chambres] node scripts/ux_captures.cjs
// Pour chaque écran et chaque largeur : une capture, puis des mesures prises dans la page (débordement horizontal,
// montants coupés, cibles tactiles trop petites). Le résumé est écrit dans <DOSSIER>/mesures.json.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const U = process.env.URL_APP ?? 'http://localhost:4173/';
const DOSSIER = process.env.DOSSIER ?? 'captures-ux';
const LARGEURS = (process.env.LARGEURS ?? '320,390,768,1024,1366,1920').split(',').map(Number);
const ECRANS = (process.env.ECRANS ?? [
  'accueil', 'tableau-de-bord', 'tableau-de-bord/commerce', 'caisse', 'ventes', 'clotures', 'qui-me-doit', 'factures',
  'articles', 'stock', 'achats', 'depenses', 'contacts', 'salle', 'hotel', 'chambres', 'rapports', 'equipe', 'hubs',
  'parametres', 'applications',
].join(',')).split(',');
const PROFIL = process.env.PROFIL ?? 'Mireille';
const HAUTEURS = { 320: 640, 375: 740, 390: 844, 430: 932, 768: 1024, 1024: 768, 1366: 820, 1440: 900, 1920: 1080 };

// Mesures faites dans la page : rien n'est modifié.
function mesurer() {
  const largeur = document.documentElement.clientWidth;
  // Visible à l'écran : ni caché, ni dans le menu replié hors de l'écran (tiroir du téléphone).
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < largeur && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // Nombre de lignes réellement occupées par le texte (une boîte par ligne).
  const lignesTexte = (el) => {
    const plage = document.createRange();
    plage.selectNodeContents(el);
    const tops = new Set([...plage.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
    return tops.size;
  };
  // Défilement horizontal d'un tableau : le chiffre existe mais il faut faire glisser pour le voir.
  const dansDefilement = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  // Un montant : des chiffres suivis de FCFA / € / %.
  const montant = /\d[\d\s  .,]*\s?(FCFA|€|%)/;
  const coupes = [];
  for (const el of document.querySelectorAll('main *')) {
    if (el.children.length || !visible(el)) continue;
    const texte = el.textContent.trim();
    if (!montant.test(texte)) continue;
    const s = getComputedStyle(el);
    // Coupé : texte plus large que sa boîte, masqué (overflow hidden, « … »).
    const deborde = el.scrollWidth > el.clientWidth + 1 && (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis');
    // Montant court réparti sur plusieurs lignes (« 125 750 » / « 000 FCFA »).
    const lignes = texte.length < 26 ? lignesTexte(el) : 1;
    const r = el.getBoundingClientRect();
    const horsEcran = (r.right > largeur + 1 || r.left < -1) && !el.closest('.menu');
    const glisser = horsEcran && dansDefilement(el);
    if (deborde || horsEcran || lignes > 1) coupes.push({ texte: texte.slice(0, 40), deborde, horsEcran, glisser, lignes, ou: `${el.tagName.toLowerCase()}.${el.className || ''} < ${el.parentElement?.tagName.toLowerCase()}.${el.parentElement?.className || ''}`.slice(0, 90) });
  }
  const petites = [];
  for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [tabindex="0"]')) {
    if (!visible(el) || el.closest('.ticket, .feuille-a4')) continue;
    const r = el.getBoundingClientRect();
    if (el.type === 'checkbox' || el.type === 'radio') continue;
    if (r.right <= 0 || r.left >= largeur) continue;
    if (r.height < 36 || r.width < 36) petites.push(`${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  return {
    debordement: document.documentElement.scrollWidth > largeur + 1 ? document.documentElement.scrollWidth - largeur : 0,
    montantsCoupes: coupes.length,
    montantsSurDeuxLignes: coupes.filter((c) => c.lignes > 1).length,
    montantsMasques: coupes.filter((c) => c.deborde).length,
    montantsHorsEcran: coupes.filter((c) => c.horsEcran).length,
    exemplesMontants: coupes.slice(0, 5),
    ciblesPetites: petites.length,
    exemplesCibles: petites.slice(0, 5),
  };
}

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(U);
  await page.getByText(PROFIL).first().click({ timeout: 120000 });
  await page.waitForTimeout(3000);
  // La caisse de démonstration est ouverte : « Tu continues ? » s'affiche une fois après la connexion.
  const question = page.getByRole('dialog', { name: /Bonjour/ });
  await question.getByRole('button', { name: 'Oui, je continue' }).click({ timeout: 15000 }).catch(() => {});
  await question.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  const resultats = [];
  for (const ecran of ECRANS) {
    await page.setViewportSize({ width: 1366, height: 820 });
    await page.goto(`${U}#/${ecran}`);
    await page.waitForTimeout(1200);
    // Attendre la fin du chargement (la base de démonstration tourne dans le navigateur).
    await page.waitForFunction(() => !document.querySelector('main .chargement, main .squelette'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const route = await page.evaluate(() => window.location.hash.slice(2));
    if (route.split('?')[0] !== ecran) {
      resultats.push({ ecran, absent: true });
      continue;
    }
    for (const largeur of LARGEURS) {
      await page.setViewportSize({ width: largeur, height: HAUTEURS[largeur] ?? 900 });
      await page.waitForTimeout(450);
      await page.waitForFunction(() => !document.querySelector('main .chargement, main .squelette'), null, { timeout: 15000 }).catch(() => {});
      const nom = `${ecran.replace(/\//g, '_')}__${largeur}.png`;
      await page.screenshot({ path: path.join(DOSSIER, nom) });
      resultats.push({ ecran, largeur, ...(await page.evaluate(mesurer)) });
    }
  }
  const total = (cle) => resultats.reduce((s, r) => s + (r[cle] && typeof r[cle] === 'number' ? (cle === 'debordement' ? 1 : r[cle]) : 0), 0);
  const resume = {
    date: new Date().toISOString(),
    ecransMesures: resultats.filter((r) => !r.absent).length,
    ecransAbsents: resultats.filter((r) => r.absent).map((r) => r.ecran),
    pagesQuiDebordent: total('debordement'),
    montantsCoupes: total('montantsCoupes'),
    montantsSurDeuxLignes: total('montantsSurDeuxLignes'),
    montantsMasques: total('montantsMasques'),
    montantsHorsEcran: total('montantsHorsEcran'),
    ciblesPetites: total('ciblesPetites'),
    erreurs,
  };
  fs.writeFileSync(path.join(DOSSIER, 'mesures.json'), JSON.stringify({ resume, resultats }, null, 2));
  console.log(JSON.stringify(resume, null, 2));
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
