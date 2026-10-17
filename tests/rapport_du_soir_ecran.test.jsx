// @vitest-environment jsdom
// Écran « Rapport du soir » et bouton « Envoyer le rapport du soir » après un ticket Z. Données fictives.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FournisseurEspace } from '../src/noyau/espace.jsx';
import RapportDuSoir from '../src/modules/cloture/RapportDuSoir.jsx';
import { ModaleZ } from '../src/modules/cloture/Clotures.jsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const ETAB = 'etab-1';
const RAPPORT = {
  date: '2026-10-12', etablissement: 'Bar Démo', devise: 'XAF', whatsapp_patron: '06 123 45 67',
  total_ventes: 125000, nombre_tickets: 42, total_remises: 0, credit: 0,
  encaissements: [{ mode: 'especes', montant: 125000 }],
  top_articles: [{ libelle: 'Bière fictive', quantite: 60, total: 60000 }],
  annulations: { nombre: 0, montant: 0 }, retours: { nombre: 0, montant: 0 }, depenses: { nombre: 1, montant: 5000 },
  clotures: { nombre: 1, ecart: -200, a_compter: 0, liste: [{ numero: 'Z-00001', caissier: 'Awa', ecart: -200, a_compter: false }] },
  caissiers: [{ id: 'u1', nom: 'Awa', nombre_ventes: 42, total_ventes: 125000 }],
  caisses_ouvertes: 0,
};

function espace(permissions, enfant) {
  const rpc = vi.fn(async (nom) => (nom === 'rapport_du_soir' ? RAPPORT : null));
  const api = { rpc, lire: vi.fn(async () => [{ data: { coupures: '1000' } }]) };
  const contexte = {
    etablissements: [{ id: ETAB, nom: 'Bar Démo', ecriture: true, permissions, modules: ['cloture'], devise: 'XAF', hubs: [] }],
    compte: {}, utilisateur: { id: 'u1' },
  };
  render(<FournisseurEspace api={api} contexte={contexte} onDeconnexion={() => {}}>{enfant}</FournisseurEspace>);
  return { rpc, api };
}

describe('écran Rapport du soir', () => {
  test('gros chiffres, lien WhatsApp vers le numéro du patron, copie du texte', async () => {
    const ecrire = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    const { rpc } = espace(['cloture.cloturer', 'etablissement.modifier'], <RapportDuSoir />);
    expect(await screen.findByRole('heading', { name: 'Rapport du soir' })).toBeTruthy();
    expect(await screen.findByText('125 000 FCFA', { selector: '.stat-card-valeur' })).toBeTruthy();
    expect(screen.getByText('manque 200 FCFA')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('rapport_du_soir', expect.objectContaining({ p_etablissement_id: ETAB }));
    const lien = screen.getByRole('link', { name: 'Envoyer au patron sur WhatsApp' });
    expect(lien.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/242061234567\?text=/);
    expect(lien.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Copier le texte' }));
    await waitFor(() => expect(ecrire).toHaveBeenCalled());
    expect(ecrire.mock.calls[0][0]).toContain('*Ventes : 125 000 FCFA*');
    // Numéro changé à l'écran : le lien suit, et le gérant peut l'enregistrer.
    fireEvent.change(screen.getByLabelText(/Numéro WhatsApp du patron/), { target: { value: '' } });
    expect(screen.getByRole('link', { name: 'Envoyer au patron sur WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(screen.getByRole('button', { name: 'Enregistrer le numéro' })).toBeTruthy();
  });
});

describe('après le ticket Z', () => {
  const Z = { id: 'z1', numero: 'Z-00001', point_de_vente: 'Caisse principale', caissier_id: 'u1', caissier: 'Awa', ouverte_le: '2026-10-12T17:00:00Z',
    cloturee_le: '2026-10-12T23:00:00Z', fond_initial: 0, nombre_ventes: 1, total_ventes: 500, nombre_annulations: 0, total_annulations: 0,
    total_remises: 0, encaissements: { especes: 500 }, depenses_especes: 0, credit_accorde: 0, especes_attendues: 500, especes_comptees: 500, ecart: 0, articles_vendus: [] };

  test('le responsable voit « Envoyer le rapport du soir », qui mène à l’écran', async () => {
    const onFermer = vi.fn();
    espace(['cloture.cloturer', 'caisse.utiliser'], <ModaleZ z={Z} apresCloture onFermer={onFermer} />);
    const dialogue = await screen.findByRole('dialog', { name: /Ticket Z-00001/ });
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Envoyer le rapport du soir' }));
    expect(onFermer).toHaveBeenCalled();
    expect(window.location.hash).toBe('#/rapport-du-soir');
  });

  test('une caissière ne voit pas le bouton ; un ticket Z rouvert depuis la liste non plus', async () => {
    espace(['caisse.utiliser', 'cloture.lire'], <ModaleZ z={Z} deconnexion onFermer={() => {}} />);
    const dialogue = await screen.findByRole('dialog', { name: /Ticket Z-00001/ });
    expect(within(dialogue).queryByRole('button', { name: 'Envoyer le rapport du soir' })).toBeNull();
    cleanup();
    espace(['cloture.cloturer'], <ModaleZ z={Z} onFermer={() => {}} />);
    const autre = await screen.findByRole('dialog', { name: /Ticket Z-00001/ });
    expect(within(autre).queryByRole('button', { name: 'Envoyer le rapport du soir' })).toBeNull();
  });
});
