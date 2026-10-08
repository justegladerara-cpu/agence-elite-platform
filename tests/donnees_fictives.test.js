import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';

async function sources(dossier) {
  const fichiers = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) fichiers.push(...await sources(chemin));
    else if (/\.(?:js|jsx|cjs|mjs|sql)$/.test(entree.name)) fichiers.push(chemin);
  }
  return fichiers;
}

test('tests et démonstration ne chargent aucun fichier des imports clients', async () => {
  const fichiers = [
    ...await sources(new URL('.', import.meta.url).pathname),
    ...await sources(new URL('../src/noyau/donnees', import.meta.url).pathname),
    ...await sources(new URL('../supabase/demo', import.meta.url).pathname),
  ];
  const interdits = [];
  for (const fichier of fichiers) {
    const texte = await readFile(fichier, 'utf8');
    if (/donnees[/\\]+imports/.test(texte)) interdits.push(fichier);
  }
  expect(interdits, 'Aucune lecture du catalogue réel dans les tests/démo').toEqual([]);
});
