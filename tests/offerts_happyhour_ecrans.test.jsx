// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Lot 3 (migration 20261013000135) : fenêtres « Offrir » et « Encaissement » avec pourboire, sans base.
const espace = {
  api: { rpc: vi.fn() },
  etablissement: { id: 'etab-test', nom: 'Bar Test' },
  devise: 'XAF',
  montant: (n) => `${n} F`,
  peut: () => true,
};
vi.mock('../src/noyau/espace.jsx', () => ({ useEspace: () => espace, useDonnees: () => ({}) }));

const { ModaleOffrir, ModalePaiement } = await import('../src/modules/caisse/Caisse.jsx');

afterEach(cleanup);

describe('Offrir une ligne', () => {
  test('raison obligatoire, « Autre » demande une précision, quantité partielle', () => {
    const onValider = vi.fn();
    render(<ModaleOffrir ligne={{ article_id: 'b', quantite: 3 }} article={{ id: 'b', nom: 'Primus', prix_vente: 1000, unite: 'unité' }} onValider={onValider} onFermer={() => {}} />);
    const fenetre = screen.getByRole('dialog', { name: 'Offrir' });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Offrir' }));
    expect(within(fenetre).getByText('Choisissez la raison.')).toBeTruthy();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Autre' }));
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Offrir' }));
    expect(within(fenetre).getByText('Précisez la raison.')).toBeTruthy();
    fireEvent.change(within(fenetre).getByLabelText('Précisez la raison'), { target: { value: 'Anniversaire' } });
    fireEvent.change(within(fenetre).getByLabelText(/^Combien offrir/), { target: { value: '1' } });
    expect(within(fenetre).getByText(/1 offert\(s\) = 1000 F/)).toBeTruthy();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Offrir' }));
    expect(onValider).toHaveBeenCalledWith(1, { raison: 'Autre', precision: 'Anniversaire' });
  });
});

describe('Encaissement avec pourboire', () => {
  const ouvrir = (props) => render(<ModalePaiement total={5000} contacts={[]} contactId={null} onContact={() => {}} onFermer={() => {}} {...props} />);

  test('pourboire facultatif en Mobile Money, transmis à part (le total ne change pas)', async () => {
    const onValider = vi.fn().mockResolvedValue();
    ouvrir({ onValider, serveurs: ['Alex'], avecPourboire: true });
    const fenetre = screen.getByRole('dialog', { name: 'Encaissement' });
    fireEvent.click(within(fenetre).getByRole('button', { name: '+ Pourboire' }));
    fireEvent.change(within(fenetre).getByLabelText(/^Montant du pourboire/), { target: { value: '500' } });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Mobile Money' }));
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Alex' }));
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la vente' }));
    await waitFor(() => expect(onValider).toHaveBeenCalled());
    const [paiements, extra] = onValider.mock.calls[0];
    expect(paiements).toEqual([{ mode: 'especes', montant: 5000, reference: '' }]);
    expect(extra).toEqual({ serviPar: 'Alex', pourboire: { montant: 500, mode: 'mobile_money' } });
  });

  test('sans pourboire : rien de plus ; écran sans pourboire (Salle) : pas de bouton', async () => {
    const onValider = vi.fn().mockResolvedValue();
    ouvrir({ onValider, avecPourboire: true });
    fireEvent.click(screen.getByRole('button', { name: 'Valider la vente' }));
    await waitFor(() => expect(onValider).toHaveBeenCalled());
    expect(onValider.mock.calls[0][1]).toEqual({ serviPar: '', pourboire: null });
    cleanup();
    ouvrir({ onValider });
    expect(screen.queryByRole('button', { name: '+ Pourboire' })).toBeNull();
  });
});
