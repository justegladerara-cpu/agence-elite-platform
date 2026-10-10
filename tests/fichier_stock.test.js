import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { lireFichierStock, MODELE_STOCK } from '../src/modules/stock/fichierStock.js';

describe('fichier de stock', () => {
  test('le modèle se relit : catégorie facultative, code-barres absent', () => {
    const lignes = lireFichierStock(MODELE_STOCK);
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toEqual({ nom: 'Riz parfumé 5 kg', categorie: 'Épicerie', quantite: '20', prix_vente: '5000' });
    expect(lignes[3]).toEqual({ nom: 'Sac cabas', quantite: '50', prix_vente: '200' });
  });

  test('le modèle de la documentation est le même que celui téléchargé', async () => {
    expect(await readFile(new URL('../docs/modele_stock.csv', import.meta.url), 'utf8')).toBe(MODELE_STOCK);
  });

  test('séparateur virgule, noms de colonnes courants, lignes sans quantité ignorées', () => {
    const lignes = lireFichierStock('Article,Qté,Famille\n"Eau 1,5 L","12,5",Boissons\nBiscuit,,Épicerie\n"Pain, baguette",3,\n');
    expect(lignes).toEqual([
      { nom: 'Eau 1,5 L', quantite: '12,5', categorie: 'Boissons' },
      { nom: 'Pain, baguette', quantite: '3' },
    ]);
  });

  test('colonnes obligatoires manquantes : message clair', () => {
    expect(() => lireFichierStock('nom;prix\nRiz;5000')).toThrow(/nom.*quantite/);
    expect(() => lireFichierStock('nom;quantite')).toThrow(/au moins un article/);
  });
});
