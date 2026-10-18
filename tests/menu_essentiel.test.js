// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { PAGES_ESSENTIELLES, lireRecents, noterPageOuverte, separerMenu } from '../src/noyau/menuEssentiel.js';

// Menu court : écrans de tous les jours d'abord, le reste replié ; rien n'est retiré.
const page = (id) => ({ id, groupe: 'Vente' });
const ids = (l) => l.map((p) => p.id);

describe('menu court', () => {
  beforeEach(() => window.localStorage.clear());

  it('garde les écrans de tous les jours et replie le reste', () => {
    const pages = ['accueil', 'caisse', 'ventes', 'agenda', 'support', 'fidelite', 'location'].map(page);
    const { courtes, autres } = separerMenu(pages);
    expect(ids(courtes)).toEqual(['accueil', 'caisse', 'ventes']);
    expect(ids(autres)).toEqual(['agenda', 'support', 'fidelite', 'location']);
  });

  it('ne perd aucun écran', () => {
    const pages = ['caisse', 'agenda', 'support', 'fidelite', 'hotel', 'salle'].map(page);
    const { courtes, autres } = separerMenu(pages);
    expect([...courtes, ...autres]).toHaveLength(pages.length);
  });

  it('les écrans de l’hôtel et du restaurant restent dans le menu court', () => {
    for (const id of ['hotel', 'chambres', 'salle', 'cuisine', 'caisse', 'clotures']) expect(PAGES_ESSENTIELLES).toContain(id);
  });

  it('ne replie rien quand il y a trop peu d’écrans en plus', () => {
    const pages = ['caisse', 'ventes', 'agenda', 'support'].map(page);
    expect(separerMenu(pages).autres).toEqual([]);
  });

  it('ne laisse jamais un menu court vide', () => {
    const pages = ['agenda', 'support', 'fidelite', 'location'].map(page);
    expect(ids(separerMenu(pages).courtes)).toEqual(ids(pages));
  });

  it('un écran ouvert récemment ou affiché remonte dans le menu court', () => {
    const pages = ['caisse', 'agenda', 'support', 'fidelite', 'location', 'marketing'].map(page);
    noterPageOuverte('agenda');
    const { courtes } = separerMenu(pages, { recents: lireRecents(), pageActive: 'support' });
    expect(ids(courtes)).toEqual(['caisse', 'agenda', 'support']);
  });

  it('oublie un écran pas ouvert depuis 30 jours', () => {
    const il_y_a_40_jours = Date.now() - 40 * 24 * 3600 * 1000;
    noterPageOuverte('agenda', il_y_a_40_jours);
    expect(lireRecents()).toEqual({});
  });
});
