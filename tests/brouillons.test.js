import { describe, expect, test } from 'vitest';
import { cleBrouillon, DUREE_BROUILLON_MS, ecrireBrouillon, effacerBrouillons, lireBrouillon } from '../src/noyau/brouillons.js';

// Stockage en mémoire, avec un quota pour simuler un téléphone plein.
function stockage(quota = Infinity) {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > quota) { const e = new Error('Quota exceeded'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
}

describe('brouillons automatiques', () => {
  test('la clé sépare personne, établissement et formulaire', () => {
    expect(cleBrouillon('u1', 'e1', 'depense')).toBe('ae-brouillon:u1:e1:depense');
    expect(cleBrouillon('u1', 'e2', 'depense')).not.toBe(cleBrouillon('u1', 'e1', 'depense'));
  });

  test('écrit, relit, puis oublie un brouillon de plus de 7 jours', () => {
    const s = stockage();
    const cle = cleBrouillon('u', 'e', 'f');
    expect(ecrireBrouillon(s, cle, { libelle: 'Taxi' }, 'v1', 1000)).toBe('ok');
    expect(lireBrouillon(s, cle, 2000)).toEqual({ le: 1000, version: 'v1', valeurs: { libelle: 'Taxi' } });
    expect(lireBrouillon(s, cle, 1000 + DUREE_BROUILLON_MS + 1)).toBeNull();
    expect(s.getItem(cle)).toBeNull();
  });

  test('stockage plein ou contenu illisible : rien ne casse', () => {
    const s = stockage(10);
    expect(ecrireBrouillon(s, 'k', { texte: 'un long texte' })).toBe('plein');
    expect(ecrireBrouillon(null, 'k', {})).toBe('indisponible');
    s.setItem('x', '{');
    expect(lireBrouillon(s, 'x')).toBeNull();
  });

  test('la déconnexion efface les brouillons (tous, ou ceux d’une personne)', () => {
    const s = stockage();
    ecrireBrouillon(s, cleBrouillon('a', 'e', 'f'), { x: 1 });
    ecrireBrouillon(s, cleBrouillon('b', 'e', 'f'), { x: 1 });
    s.setItem('ae-affichage', '{}');
    effacerBrouillons(s, 'a');
    expect(s.getItem(cleBrouillon('a', 'e', 'f'))).toBeNull();
    expect(s.getItem(cleBrouillon('b', 'e', 'f'))).not.toBeNull();
    effacerBrouillons(s);
    expect(s.length).toBe(1);
  });
});
