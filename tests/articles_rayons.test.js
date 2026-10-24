import { describe, expect, it } from 'vitest';
import { rangerParRayon, SANS_RAYON } from '../src/modules/articles/rayons.js';

describe('articles rangés par rayon', () => {
  const categories = [{ id: 'b', nom: 'Bières' }, { id: 'p', nom: 'Plats' }, { id: 'x', nom: 'Ancien', archivee_le: '2026-01-01' }];
  const articles = [
    { id: 1, nom: 'Primus', categorie_id: 'b' },
    { id: 2, nom: 'Ngok', categorie_id: 'b' },
    { id: 3, nom: 'Mutzig', categorie_id: 'b' },
    { id: 4, nom: 'Brochettes', categorie_id: 'p' },
    { id: 5, nom: 'Eau', categorie_id: null },
  ];
  it('range chaque article dans son rayon, les plus vendus d’abord', () => {
    const r = rangerParRayon(articles, categories, { 2: { quantite: 40, chiffre: 40000 }, 1: { quantite: 10, chiffre: 9000 } });
    expect(r.map((x) => x.nom)).toEqual(['Bières', 'Plats', 'Sans rayon']);
    expect(r[0].articles.map((a) => a.nom)).toEqual(['Ngok', 'Primus', 'Mutzig']);
    expect(r[0].meilleurs).toEqual([2, 1]);
    expect(r[0].chiffre).toBe(49000);
    expect(r[2].id).toBe(SANS_RAYON);
  });
  it('garde les rayons vides mais cache « Sans rayon » vide', () => {
    const r = rangerParRayon(articles.slice(0, 3), categories);
    expect(r.map((x) => x.nom)).toEqual(['Bières', 'Plats']);
    expect(r[1].articles).toEqual([]);
  });
});
