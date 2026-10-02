import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import App from '../src/App.jsx';
import { pagesAccessibles, PAGES } from '../src/modules/index.js';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { formatMontant, formatQuantite } from '../src/noyau/format.js';
import { creerClientSupabase } from '../src/noyau/supabase.js';
import { creerBaseLocale } from './helpers/locale.js';

afterEach(cleanup);

describe('formats', () => {
  test('les montants en FCFA sont arrondis', () => {
    expect(formatMontant(12500.4).replace(/\s/g, ' ')).toBe('12 500 FCFA');
    expect(formatQuantite(2.5)).toContain('2,5');
  });
});

describe('registre des écrans', () => {
  test('une page exige module actif et permission', () => {
    const espace = (modules, permissions) => ({ moduleActif: (m) => modules.includes(m), peut: (p) => permissions.includes(p) });
    expect(pagesAccessibles(espace(['caisse'], ['caisse.utiliser'])).map((p) => p.id)).toEqual(['caisse']);
    expect(pagesAccessibles(espace([], ['caisse.utiliser']))).toEqual([]);
    expect(pagesAccessibles(espace(PAGES.map((p) => p.module), PAGES.map((p) => p.permission)))).toHaveLength(PAGES.length);
  });
});

describe('configuration Supabase locale', () => {
  test('reste désactivée sans variables', () => expect(creerClientSupabase({})).toBeNull());
  test('refuse toute URL distante sans accord explicite', () => expect(() => creerClientSupabase({ VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictive' })).toThrow(/locale/));
  test('accepte une instance hébergée seulement avec l’accord du déploiement', () => {
    expect(creerClientSupabase({ VITE_SUPABASE_URL: 'https://projet.supabase.co', VITE_SUPABASE_ANON_KEY: 'fictive', VITE_AUTORISER_SUPABASE_DISTANT: 'oui' })).toBeTruthy();
    expect(() => creerClientSupabase({ VITE_SUPABASE_URL: 'https://pirate.example.com', VITE_SUPABASE_ANON_KEY: 'fictive', VITE_AUTORISER_SUPABASE_DISTANT: 'oui' })).toThrow();
  });
});

describe('application sur la base locale', () => {
  let db;
  let comptes;
  beforeAll(async () => {
    db = await creerBaseLocale();
    await semerDemo(db);
    comptes = await listerComptesDemo(db);
  }, 60000);
  afterAll(async () => db.close());

  function demarrer(email) {
    let utilisateur = email ? comptes.find((c) => c.email === email).id : null;
    const api = creerApiLocale(db, () => utilisateur);
    return async () => ({
      ...api,
      comptes: async () => comptes,
      utilisateur: () => utilisateur,
      connecter: async (id) => { utilisateur = id; },
      deconnecter: async () => { utilisateur = null; },
      reinitialiser: async () => {},
    });
  }

  test('l\'écran de connexion propose les profils de démo', async () => {
    render(<App demarrer={demarrer(null)} />);
    expect(await screen.findByText(/Mireille/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Junior/));
    expect(await screen.findAllByText('Caisse')).toBeTruthy();
  });

  test('le caissier ne voit ni dépenses ni paramètres de gestion', async () => {
    window.location.hash = '';
    render(<App demarrer={demarrer('caisse-marche@demo.agence-elite.fr')} />);
    await waitFor(() => expect(screen.getAllByText('Caisse').length).toBeGreaterThan(0));
    expect(screen.queryByText('Dépenses')).toBeNull();
  });

  test('le gérant voit le tableau de bord avec le chiffre du jour', async () => {
    window.location.hash = '#/tableau-de-bord';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByText('Chiffre d’affaires', {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getAllByText(/Commerce Démo/).length).toBeGreaterThan(0);
  });
});
