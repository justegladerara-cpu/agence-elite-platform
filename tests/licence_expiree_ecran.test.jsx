// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

describe('message plein écran après la fin', () => {
  test('affiché à tout compte après l’heure, permanent, avec « Contactez l’administrateur »', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react');
    const React = (await import('react')).default;
    const { FournisseurEspace } = await import('../src/noyau/espace.jsx');
    const { EcranLicenceExpiree } = await import('../src/ui/FinLicence.jsx');
    const etablissement = {
      id: 'e-fin', nom: 'Bar Fictif', ecriture: false, statut: 'actif', client_statut: 'actif', role: 'employe', permissions: [],
      licence: { statut: 'active', valide: false, fin_a: new Date(Date.now() - 60000).toISOString() },
    };
    const contexte = { etablissements: [etablissement], editeur: null, compte: {}, utilisateur: { id: 'u' }, invitations: [] };
    render(React.createElement(FournisseurEspace, { api: {}, contexte, onRecharger: () => {}, onDeconnexion: () => {} },
      React.createElement(EcranLicenceExpiree)));
    expect(screen.getByRole('alertdialog', { name: 'Licence expirée' })).toBeTruthy();
    expect(screen.getByText('Contactez l’administrateur.')).toBeTruthy();
    expect(screen.queryByText('Consulter mes données')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('alertdialog', { name: 'Licence expirée' })).toBeTruthy();
    cleanup();
  });
});
