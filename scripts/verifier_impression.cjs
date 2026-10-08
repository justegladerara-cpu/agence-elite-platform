// Vérifie les composants réels avec des documents entièrement fictifs.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = process.env.URL_IMPRESSION ?? 'http://127.0.0.1:5173/tests/navigateur/impression.html';
const captures = process.env.CAPTURES_IMPRESSION ?? 'captures-parcours/impression';
(async () => {
  fs.mkdirSync(captures, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
  const erreurs = [];
  p.on('pageerror', e => {erreurs.push(e.message); console.error('PAGEERROR', e.message);});
  p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  const echecs = [];
  try {
    for (const type of ['ticket', 'a4']) {
      await p.emulateMedia({ media: 'screen' });
      await p.setViewportSize({ width: 1360, height: 900 });
      await p.goto(`${U}?type=${type}`);
      const classe = type === 'ticket' ? '.ticket' : '.feuille-a4';
      const apercu = type === 'ticket' ? '.ticket-apercu .ticket' : '.feuille-conteneur .feuille-a4';
      const imprime = `.zone-impression ${classe}`;
      try {await p.locator(apercu).waitFor();} catch(e) {console.error('ÉCRAN', (await p.locator('body').innerText()).slice(0,1000), 'ERREURS', erreurs);throw e;}
      await p.locator(imprime).waitFor({ state: 'attached' });
      assert.equal(await p.locator(apercu).innerHTML(), await p.locator(imprime).innerHTML(), `${type} : contenu aperçu/impression`);
      const dimensions = async selecteur => p.locator(selecteur).evaluate(el => {
        const s = getComputedStyle(el);
        return { largeur: el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), police: s.fontFamily, taille: s.fontSize };
      });
      const ecran = await dimensions(apercu);
      await p.screenshot({ path: path.join(captures, `${type}-apercu.png`), fullPage: true });
      await p.emulateMedia({ media: 'print' });
      await p.setViewportSize({ width: Math.round((type === 'ticket' ? 72 : 186) * 96 / 25.4), height: 1100 });
      const papier = await dimensions(imprime);
      if (Math.abs(ecran.largeur - papier.largeur) > 1) echecs.push(`${type} : largeur contenu aperçu ${ecran.largeur.toFixed(2)} px / impression ${papier.largeur.toFixed(2)} px`);
      assert.equal(ecran.police, papier.police, `${type} : police`);
      assert.equal(ecran.taille, papier.taille, `${type} : taille de caractères`);
      const pdf = await p.pdf({ width: '80mm', height: '150mm', preferCSSPageSize: true, printBackground: true });
      fs.writeFileSync(path.join(captures, `${type}.pdf`), pdf);
      const boites = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
      assert.equal(boites.length, 1, 'Le document fictif tient sur une seule page sans page blanche');
      const largeurAttendue = (type === 'ticket' ? 80 : 210) * 72 / 25.4;
      if (Math.abs(Number(boites[0][1]) - largeurAttendue) > 1) echecs.push(`${type} : largeur papier PDF ${boites[0][1]} pt / attendu ${largeurAttendue.toFixed(2)} pt`);
      console.log(`${type} : contenu identique, PDF ${boites[0][1]} × ${boites[0][2]} pt, contenu ${ecran.largeur.toFixed(2)} / ${papier.largeur.toFixed(2)} px`);
      // Le défilement du papier reste dans son cadre, y compris au téléphone.
      await p.emulateMedia({ media: 'screen' });
      await p.setViewportSize({ width: 390, height: 844 });
      const depassement = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (depassement > 2) echecs.push(`${type} : débordement mobile ${depassement}px`);
    }
    assert.deepEqual(erreurs, [], 'Console navigateur');
    assert.deepEqual(echecs, [], 'Aperçu, papier et mobile');
    console.log('IMPRESSION VALIDÉE');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
