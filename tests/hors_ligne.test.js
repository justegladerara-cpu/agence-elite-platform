import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { inscrireOuvertureHorsLigne } from '../src/noyau/horsLigne.js';

// Ouverture sans réseau : service worker inscrit en production seulement, qui ne garde jamais les données.
describe('ouverture hors ligne', () => {
  test('inscrit seulement en production et si le navigateur le permet', () => {
    const nav = { serviceWorker: { register: vi.fn(() => Promise.resolve()) } };
    expect(inscrireOuvertureHorsLigne({ MODE: 'demo', BASE_URL: '/' }, nav)).toBe(false);
    expect(inscrireOuvertureHorsLigne({ MODE: 'development', BASE_URL: '/' }, nav)).toBe(false);
    expect(inscrireOuvertureHorsLigne({ MODE: 'production', BASE_URL: '/' }, {})).toBe(false);
    expect(inscrireOuvertureHorsLigne({ MODE: 'production', BASE_URL: '/' }, nav)).toBe(true);
  });

  test('le service worker laisse passer les appels à la base, /version.json et les écritures', () => {
    const sw = readFileSync(new URL('../src/noyau/sw.modele.js', import.meta.url), 'utf8');
    expect(sw).toMatch(/r\.method !== 'GET'/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/);
    expect(sw).toMatch(/\/version\.json/);
    expect(sw).not.toMatch(/cache\.put|\.put\(/);
  });
});
