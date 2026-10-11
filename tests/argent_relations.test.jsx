import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import App from '../src/App.jsx';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { creerBaseLocale } from './helpers/locale.js';

afterEach(cleanup);

// Écrans « argent et relations » sur la base de démonstration (aucune donnée réelle).
describe('argent et relations (démo)', () => {
  let db;
  let comptes;
  beforeAll(async () => {
    db = await creerBaseLocale();
    await semerDemo(db);
    comptes = await listerComptesDemo(db);
  }, 60000);
  afterAll(async () => db.close());

  function demarrer(email) {
    let utilisateur = comptes.find((c) => c.email === email).id;
    const api = creerApiLocale(db, () => utilisateur);
    return async () => ({
      ...api,
      comptes: async () => comptes,
      utilisateur: () => utilisateur,
      connecter: async (id) => { utilisateur = id; },
      deconnecter: async () => { utilisateur = null; },
      demanderReinitialisation: async () => {},
      reinitialiser: async () => {},
    });
  }

  test('J’ai payé une dépense : montant, motif en un geste, enregistrée', async () => {
    window.location.hash = '#/depenses?nouveau=1';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    const dialogue = await screen.findByRole('dialog', {}, { timeout: 10000 });
    fireEvent.change(within(dialogue).getByLabelText('Combien ?'), { target: { value: '2500' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Électricité' }));
    expect(within(dialogue).getByRole('button', { name: 'Électricité' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'C’est payé' }));
    expect(await screen.findByText('Dépense enregistrée', {}, { timeout: 10000 })).toBeTruthy();
    expect((await screen.findAllByText('Électricité')).length).toBeGreaterThan(0);
  });

  test('Qui me doit ? : clients avec un reste dû, rappel WhatsApp et « Il a payé »', async () => {
    window.location.hash = '#/qui-me-doit';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByRole('heading', { name: 'Qui me doit ?' }, { timeout: 10000 })).toBeTruthy();
    const payes = await screen.findAllByRole('button', { name: 'Il a payé' }, { timeout: 10000 });
    expect(payes.length).toBeGreaterThan(0);
    const liens = screen.queryAllByRole('link', { name: 'Rappeler sur WhatsApp' });
    for (const l of liens) expect(l.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  });

  test('À qui je dois ? : écran des dettes fournisseurs', async () => {
    window.location.hash = '#/a-qui-je-dois';
    render(<App demarrer={demarrer('gerante@demo.agence-elite.fr')} />);
    expect(await screen.findByRole('heading', { name: 'À qui je dois ?' }, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Voir les commandes à payer' })).toBeTruthy();
  });
});
