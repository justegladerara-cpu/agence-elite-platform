// Garde-fou : une règle d'impression ne doit jamais toucher tout le logiciel.
// Le 2026-10-12, « body * { visibility: hidden } » du menu QR rendait les reçus, tickets Z et factures blancs à l'impression.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fichiersCss(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersCss(chemin);
    return nom.endsWith('.css') ? [chemin] : [];
  });
}

// Renvoie le contenu de chaque bloc « @media print { … } » (accolades équilibrées).
function blocsImpression(css) {
  const blocs = [];
  let i = css.indexOf('@media print');
  while (i !== -1) {
    let j = css.indexOf('{', i) + 1;
    const debut = j;
    let profondeur = 1;
    while (profondeur > 0 && j < css.length) {
      if (css[j] === '{') profondeur += 1;
      if (css[j] === '}') profondeur -= 1;
      j += 1;
    }
    blocs.push(css.slice(debut, j - 1));
    i = css.indexOf('@media print', j);
  }
  return blocs;
}

describe('impression', () => {
  const fichiers = fichiersCss('src');
  it('trouve les feuilles de style', () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });
  it.each(fichiers)('%s : chaque règle d’impression est limitée à une classe posée sur body', (fichier) => {
    const css = readFileSync(fichier, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const bloc of blocsImpression(css)) {
      const selecteurs = [...bloc.matchAll(/([^{}]+)\{[^{}]*\}/g)]
        .map((m) => m[1].trim())
        .filter((s) => s && !s.startsWith('@page'));
      for (const groupe of selecteurs) {
        for (const s of groupe.split(',').map((x) => x.trim())) {
          expect(s, `${fichier} : « ${s} » s'applique à toutes les impressions`).toMatch(/^body\.[a-z0-9-]+/);
        }
      }
    }
  });
  it('les reçus et tickets Z restent visibles à l’impression', () => {
    const css = fichiers.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(css).toMatch(/body\.impression-ticket \.zone-impression\s*\{\s*display: block/);
    expect(css).not.toMatch(/@media print\s*\{\s*body \*/);
  });
});
