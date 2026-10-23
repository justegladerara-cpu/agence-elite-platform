// @vitest-environment jsdom
// Écran du serveur « Prendre une commande » : toucher les articles, écrire la table, envoyer à la caisse ouverte.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FournisseurEspace } from '../src/noyau/espace.jsx';
import PrendreCommande from '../src/modules/caisse/PrendreCommande.jsx';

afterEach(cleanup);

const tuile = (nom) => screen.getAllByRole('button', { name: new RegExp(nom) }).find((b) => b.classList.contains('tuile-article'));

const ETAB = 'etab-1';
const ARTICLES = [
  { id: 'a1', etablissement_id: ETAB, nom: 'Bière fictive', prix_vente: 1000, unite: 'bouteille', categorie_id: null, actif: true, disponible: true },
  { id: 'a2', etablissement_id: ETAB, nom: 'Jus fictif', prix_vente: 500, unite: 'unité', categorie_id: null, actif: true, disponible: true },
];

function rendre(caisses) {
  const rpc = vi.fn(async (nom) => {
    if (nom === 'caisses_pour_commande') return caisses;
    if (nom === 'mes_commandes_envoyees') return [];
    if (nom === 'envoyer_commande_caisse') return { id: 'w1', libelle: 'Table 5 · Brice', total: 2500, caissier: 'Awa' };
    return null;
  });
  const api = { rpc, lire: vi.fn(async (table) => (table === 'articles' ? ARTICLES : [])) };
  const contexte = {
    etablissements: [{ id: ETAB, nom: 'Bar test', ecriture: true, permissions: ['caisse.commander', 'articles.lire'], modules: ['caisse'], devise: 'XAF', hubs: [] }],
    compte: {}, utilisateur: {},
  };
  render(<FournisseurEspace api={api} contexte={contexte}><PrendreCommande /></FournisseurEspace>);
  return rpc;
}

describe('prendre une commande', () => {
  test('deux bières et un jus pour la table 5 partent à la caisse de Awa', async () => {
    const rpc = rendre([{ session_id: 's1', caissier: 'Awa', point_de_vente: 'Caisse principale' }]);
    await screen.findByText('La commande part à la caisse de Awa.');
    fireEvent.click(tuile('Bière fictive'));
    fireEvent.click(tuile('Bière fictive'));
    fireEvent.click(tuile('Jus fictif'));
    fireEvent.change(screen.getByLabelText('Table ou nom du client'), { target: { value: 'Table 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer à la caisse' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('envoyer_commande_caisse', {
      p_etablissement_id: ETAB, p_lignes: [{ article_id: 'a1', quantite: 2 }, { article_id: 'a2', quantite: 1 }], p_libelle: 'Table 5', p_session_id: 's1',
    }));
  });

  test('aucune caisse ouverte : message clair, envoi impossible', async () => {
    rendre([]);
    await screen.findByText(/Aucune caisse n’est ouverte/);
    fireEvent.click(tuile('Bière fictive'));
    expect(screen.getByRole('button', { name: 'Envoyer à la caisse' }).disabled).toBe(true);
  });
});
