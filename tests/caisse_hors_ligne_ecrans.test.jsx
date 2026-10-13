// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Caisse sans internet (migration 20261013000138) : bandeau, reçu « hors ligne », ventes à vérifier, sans base.
const espace = {
  api: { rpc: vi.fn() },
  etablissement: { id: 'etab-ecrans', nom: 'Bar Test', devise: 'XAF' },
  utilisateur: { id: 'u1' },
  devise: 'XAF',
  montant: (n) => `${n} F`,
  notifier: vi.fn(),
  peut: () => true,
};
vi.mock('../src/noyau/espace.jsx', () => ({ useEspace: () => espace, useDonnees: () => ({}) }));

const { BandeauHorsLigne, ModaleRecuHorsLigne, ModaleVentesAVerifier } = await import('../src/modules/caisse/EcransHorsLigne.jsx');
const { ajouterVente, lireFile, marquerAVerifier } = await import('../src/modules/caisse/horsLigne.js');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('bandeau', () => {
  test('sans internet : nombre de ventes en attente ; connexion revenue : bouton d’envoi', () => {
    const { rerender } = render(<BandeauHorsLigne enLigne={false} enAttente={2} aVerifier={0} onEnvoyer={() => {}} onVoir={() => {}} />);
    expect(screen.getByText(/Pas d’internet : 2 vente\(s\) en attente d’envoi/)).toBeTruthy();
    const onEnvoyer = vi.fn();
    rerender(<BandeauHorsLigne enLigne enAttente={1} aVerifier={0} onEnvoyer={onEnvoyer} onVoir={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer maintenant' }));
    expect(onEnvoyer).toHaveBeenCalledWith({ forcer: true });
    rerender(<BandeauHorsLigne enLigne enAttente={0} aVerifier={0} onEnvoyer={() => {}} onVoir={() => {}} />);
    expect(screen.queryByText(/en attente d’envoi/)).toBeNull();
  });
});

describe('reçu hors ligne', () => {
  test('ticket marqué HORS LIGNE avec les lignes, le total et la monnaie', () => {
    const ticket = {
      lignes: [{ libelle: 'Primus', quantite: 2, prix_unitaire: 1000, remise: 0, total: 2000 }],
      paiements: [{ mode: 'especes', montant: 2000, statut: 'valide' }],
      remise: 0, total: 2000, paye: 2000, cree_le: '2026-10-13T20:00:00Z', servi_par: 'Alex', vendeur: 'Awa',
    };
    render(<ModaleRecuHorsLigne ticket={ticket} monnaie={3000} onFermer={() => {}} />);
    const fenetre = screen.getByRole('dialog', { name: 'Reçu hors ligne' });
    expect(within(fenetre).getAllByText(/HORS LIGNE/).length).toBeGreaterThan(0);
    expect(within(fenetre).getAllByText('Primus').length).toBeGreaterThan(0);
    expect(within(fenetre).getByText(/Monnaie à rendre/)).toBeTruthy();
    expect(within(fenetre).getAllByText('Alex').length).toBeGreaterThan(0);
  });
});

describe('ventes à vérifier', () => {
  test('message du refus, « Réessayer » remet la vente en file, retrait avec motif par un responsable', () => {
    ajouterVente('etab-ecrans', { params: { p_cle: 'k1', p_session_id: 's1', p_lignes: [] }, utilisateur_id: 'u1', ticket: { total: 1000, lignes: [{ libelle: 'Primus', quantite: 1 }] } });
    marquerAVerifier('etab-ecrans', 'k1', 'Stock insuffisant pour « Primus »');
    const { rerender } = render(<ModaleVentesAVerifier etab="etab-ecrans" liste={lireFile('etab-ecrans')} onFermer={() => {}} />);
    const fenetre = screen.getByRole('dialog', { name: 'Ventes sans internet à vérifier' });
    expect(within(fenetre).getByText(/Refusée : Stock insuffisant/)).toBeTruthy();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Réessayer' }));
    expect(lireFile('etab-ecrans')[0].statut).toBe('en_attente');
    marquerAVerifier('etab-ecrans', 'k1', 'Stock insuffisant pour « Primus »');
    rerender(<ModaleVentesAVerifier etab="etab-ecrans" liste={lireFile('etab-ecrans')} onFermer={() => {}} />);
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Retirer de la liste' }));
    fireEvent.change(within(fenetre).getByLabelText(/Pourquoi retirer/), { target: { value: 'Déjà saisie' } });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Oui, retirer' }));
    expect(lireFile('etab-ecrans')).toEqual([]);
  });
});
