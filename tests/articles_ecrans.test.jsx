// @vitest-environment jsdom
// Écrans Articles : formulaire court, plusieurs articles d'un coup (modèle par métier), changement de prix en lot.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FournisseurEspace } from '../src/noyau/espace.jsx';
import Articles from '../src/modules/articles/Articles.jsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const ETAB = 'etab-1';
const ARTICLES = [
  { id: 'a1', etablissement_id: ETAB, nom: 'Bière fictive', prix_vente: 600, cout_achat: 450, unite: 'bouteille', categorie_id: 'c1', actif: true, suivi_stock: false, stock_minimum: 0, photo: null },
  { id: 'a2', etablissement_id: ETAB, nom: 'Jus fictif', prix_vente: 1230, cout_achat: null, unite: 'unité', categorie_id: 'c1', actif: true, suivi_stock: true, stock_minimum: 2, photo: null },
  { id: 'a3', etablissement_id: ETAB, nom: 'Pain fictif', prix_vente: 150, unite: 'unité', categorie_id: null, actif: true, suivi_stock: false, stock_minimum: 0, photo: null },
];

function rendre(permissions = ['articles.lire', 'articles.gerer', 'stock.lire', 'stock.ajuster']) {
  const rpc = vi.fn(async (nom, params) => (nom === 'importer_articles' ? { crees: params.p_lignes.length, mis_a_jour: 0 } : 'id'));
  const api = {
    rpc,
    lire: vi.fn(async (table) => {
      if (table === 'articles') return ARTICLES;
      if (table === 'categories_articles') return [{ id: 'c1', nom: 'Boissons', ordre: 0 }];
      return [];
    }),
  };
  const contexte = {
    etablissements: [{ id: ETAB, nom: 'Boutique test', ecriture: true, permissions, modules: ['articles'], devise: 'XAF', hubs: [] }],
    compte: {}, utilisateur: {},
  };
  render(<FournisseurEspace api={api} contexte={contexte}><Articles /></FournisseurEspace>);
  return rpc;
}

describe('ajouter un article', () => {
  test('?nouveau=1 ouvre le formulaire court : nom, prix, « Vendu à », photo ; le reste sous « Plus d’options »', async () => {
    window.location.hash = '#/articles?nouveau=1';
    const rpc = rendre();
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('Ajouter un article')).toBeTruthy();
    expect(within(dialogue).getByLabelText('Nom de l’article')).toBeTruthy();
    expect(within(dialogue).queryByLabelText(/Coût d’achat/)).toBeNull();
    const [camera, galerie] = dialogue.querySelectorAll('input[type=file]');
    expect(camera.getAttribute('accept')).toBe('image/*');
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(galerie.hasAttribute('capture')).toBe(false);
    fireEvent.change(within(dialogue).getByLabelText('Nom de l’article'), { target: { value: 'Riz fictif' } });
    fireEvent.change(within(dialogue).getByLabelText('Prix de vente'), { target: { value: '800' } });
    fireEvent.change(within(dialogue).getByLabelText('Vendu à'), { target: { value: 'kg' } });
    fireEvent.click(within(dialogue).getByRole('button', { name: /Plus d’options/ }));
    // La saisie est conservée quand on ouvre les options.
    expect(within(dialogue).getByLabelText('Nom de l’article').value).toBe('Riz fictif');
    expect(within(dialogue).getByLabelText(/Coût d’achat/)).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('enregistrer_article', expect.anything()));
    expect(rpc.mock.calls[0][1].p_article).toMatchObject({ nom: 'Riz fictif', prix_vente: 800, unite: 'kg' });
  });
});

describe('ajouter plusieurs articles', () => {
  test('modèle par métier, une ligne remplie enregistrée, les lignes sans prix restent', async () => {
    const rpc = rendre();
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter plusieurs articles' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText(/Partir d’un modèle/), { target: { value: 'boissons' } });
    expect(within(dialogue).getByLabelText('Nom (ligne 1)').value).toBe('Eau minérale 50 cl');
    fireEvent.change(within(dialogue).getByLabelText('Prix de vente (ligne 1)'), { target: { value: '300' } });
    fireEvent.change(within(dialogue).getByLabelText('Stock de départ (ligne 1)'), { target: { value: '24' } });
    expect(within(dialogue).getByText(/1 article prêt/)).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Enregistrer tout' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('importer_articles', expect.anything()));
    expect(rpc.mock.calls[0][1].p_lignes).toEqual([
      { nom: 'Eau minérale 50 cl', prix_vente: 300, unite: 'bouteille', categorie: 'Eaux', suivi_stock: true, stock_initial: 24 },
    ]);
    expect(await within(dialogue).findByText(/1 article ajouté\. Il reste/)).toBeTruthy();
    expect(within(dialogue).getByLabelText('Nom (ligne 1)').value).not.toBe('Eau minérale 50 cl');
  });

  test('sans le droit stock.ajuster, pas de colonne de stock', async () => {
    rendre(['articles.lire', 'articles.gerer']);
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter plusieurs articles' }));
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).queryByLabelText('Stock de départ (ligne 1)')).toBeNull();
  });
});

describe('changer les prix', () => {
  test('aperçu ancien → nouveau, arrondi, puis un enregistrement par article avec le seul prix changé', async () => {
    const rpc = rendre();
    fireEvent.click(await screen.findByRole('button', { name: 'Changer les prix' }));
    const dialogue = await screen.findByRole('dialog');
    fireEvent.change(within(dialogue).getByLabelText('Quels articles ?'), { target: { value: 'c1' } });
    fireEvent.change(within(dialogue).getByLabelText('Combien (%)'), { target: { value: '7' } });
    fireEvent.change(within(dialogue).getByLabelText('Arrondir à'), { target: { value: '25' } });
    expect(within(dialogue).getByText('2 prix à changer')).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Appliquer les nouveaux prix' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls.map((c) => [c[0], c[1].p_article.id, c[1].p_article.prix_vente])).toEqual([
      ['enregistrer_article', 'a1', 650],
      ['enregistrer_article', 'a2', 1325],
    ]);
    expect(rpc.mock.calls[1][1].p_article).toMatchObject({ suivi_stock: true, stock_minimum: 2, unite: 'unité', categorie_id: 'c1', cout_achat: null });
  });
});
