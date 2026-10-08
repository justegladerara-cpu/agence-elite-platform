import { describe, expect, test } from 'vitest';
import { normaliserNomArticle, rapprocherCatalogue } from '../src/modules/articles/rapprocherCatalogue.js';

const ancien = [
  { id: 'uuid-a', nom: 'Coca-Cola', prix_vente: 1000, variante: null, unite: 'unité', reference: null },
  { id: 'uuid-b', nom: 'Mojito', prix_vente: 6500, variante: null, unite: 'unité', reference: null },
  { id: 'uuid-c', nom: 'Vin', prix_vente: 5000, variante: 'Verre', unite: 'unité', reference: 'V-1' },
];

describe('rapprochement conservateur des catalogues', () => {
  test('normalise les accents, apostrophes et ponctuations', () => {
    expect(normaliserNomArticle('Coca–Cola')).toBe(normaliserNomArticle('Coca Cola'));
    expect(normaliserNomArticle('Crème brûlée')).toBe('creme brulee');
  });
  test('réutilise un UUID uniquement pour un article strictement compatible', () => {
    const r = rapprocherCatalogue(ancien, [{ nom: 'Coca Cola', prix: 1000, actif: 'oui' }]);
    expect(r.correspondances[0]).toMatchObject({ statut: 'identique', article_existant_id: 'uuid-a' });
  });
  test('bloque un changement de prix', () => {
    const r = rapprocherCatalogue(ancien, [{ nom: 'Mojito', prix: 5000, actif: 'oui' }]);
    expect(r.correspondances[0]).toMatchObject({ statut: 'conflit', article_existant_id: 'uuid-b' });
  });
  test('ne confond pas des variantes', () => {
    const r = rapprocherCatalogue(ancien, [{ nom: 'Vin', prix: 5000, variante: 'Bouteille', reference: 'V-1', actif: 'oui' }]);
    expect(r.correspondances[0].statut).toBe('conflit');
  });
  test('n importe pas automatiquement un article au nom inconnu', () => {
    const r = rapprocherCatalogue(ancien, [{ nom: 'Coca Zéro', prix: 1000, actif: 'oui' }]);
    expect(r.correspondances[0].statut).toBe('a_examiner');
  });
  test('isole les articles sans prix et les inactifs', () => {
    const r = rapprocherCatalogue(ancien, [{ nom: 'Produit', actif: 'non' }, { nom: 'Sans prix', actif: 'oui' }]);
    expect(r.bilan.en_attente).toBe(2);
  });
  test('ne modifie pas les données entrantes ou existantes', () => {
    const a = structuredClone(ancien), entrants = [{ nom: 'Mojito', prix: 6500, actif: 'oui' }], b = structuredClone(entrants);
    rapprocherCatalogue(ancien, entrants);
    expect(ancien).toEqual(a);
    expect(entrants).toEqual(b);
  });
});
