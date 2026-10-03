import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { lireCsvArticles } from '../src/modules/articles/importCsv.js';

describe('catalogue The Dream retranscrit', () => {
  test('conserve les prix, variantes neutres et lignes sans prix sans en inventer', async () => {
    const csv = await readFile(new URL('../donnees/imports/the-dream/catalogue.csv', import.meta.url), 'utf8');
    const lignes = lireCsvArticles(csv);
    expect(lignes).toHaveLength(225);
    expect(lignes.filter((l) => l.actif === 'oui')).toHaveLength(221);
    expect(lignes.filter((l) => l.variante)).toHaveLength(18);
    expect(lignes.filter((l) => l.prix_vente == null)).toHaveLength(4);
    expect(lignes.find((l) => l.nom === 'Frites de pomme de terre')).toMatchObject({ actif: 'non', motif_attente: 'Tarifs contradictoires 1 000 / 1 500 XAF' });
    expect(lignes.filter((l) => l.nom === 'Mojito').map((l) => l.prix_vente).sort()).toEqual([5000, 6500]);
  });
});
