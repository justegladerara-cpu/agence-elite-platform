// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { codeComplet, formaterCode } from '../src/ui/FinLicence.jsx';

const etab = (permissions) => ({
  id: 'e-code', nom: 'Bar Fictif', ecriture: false, statut: 'actif', client_statut: 'actif', role: 'gerant', permissions,
  licence: { statut: 'active', valide: false, fin_a: new Date(Date.now() - 60000).toISOString() },
});

async function afficher(etablissement, api = {}) {
  const lib = await import('@testing-library/react');
  const React = (await import('react')).default;
  const { FournisseurEspace } = await import('../src/noyau/espace.jsx');
  const { EcranLicenceExpiree } = await import('../src/ui/FinLicence.jsx');
  const contexte = { etablissements: [etablissement], editeur: null, compte: {}, utilisateur: { id: 'u' }, invitations: [] };
  const recharger = vi.fn();
  lib.render(React.createElement(FournisseurEspace, { api, contexte, onRecharger: recharger, onDeconnexion: () => {} },
    React.createElement(EcranLicenceExpiree)));
  return { ...lib, recharger };
}

describe('code de licence', () => {
  test('saisie tolérante : minuscules, espaces, tirets oubliés', () => {
    expect(formaterCode('elite com ab12 cd34')).toBe('ELITE-COM-AB12-CD34');
    expect(formaterCode('ELITECOMAB12CD34')).toBe('ELITE-COM-AB12-CD34');
    expect(formaterCode('EL')).toBe('EL');
    expect(formaterCode('ELITE-CO')).toBe('ELITE-CO');
    expect(codeComplet('ELITE-COM-AB12-CD34')).toBe(true);
    expect(codeComplet('ELITE-COM-AB12')).toBe(false);
  });

  test('la caissière voit seulement « Contactez l’administrateur »', async () => {
    const { screen, cleanup } = await afficher(etab([]));
    expect(screen.getByText('Contactez l’administrateur.')).toBeTruthy();
    expect(screen.queryByText(/entrer le code/)).toBeNull();
    cleanup();
  });

  test('le responsable renouvelle en entrant le code, la licence est relue', async () => {
    const rpc = vi.fn().mockResolvedValue({ formule: 'annuel', echeance: '2027-10-24' });
    const { screen, fireEvent, waitFor, cleanup, recharger } = await afficher(etab(['etablissement.modifier']), { rpc });
    fireEvent.click(screen.getByText(/entrer le code de licence/));
    fireEvent.change(screen.getByLabelText('Code d’activation'), { target: { value: 'elite-com-ab12-cd34' } });
    fireEvent.click(screen.getByText('Activer la licence'));
    await waitFor(() => expect(recharger).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('activer_cle_licence', { p_cle: 'ELITE-COM-AB12-CD34', p_etablissement_id: 'e-code' });
    expect(screen.getByRole('alertdialog', { name: 'Licence expirée' })).toBeTruthy();
    cleanup();
  });

  test('un code refusé affiche le message de la base', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('Clé inconnue, déjà utilisée ou bloquée'));
    const { screen, fireEvent, cleanup } = await afficher(etab(['etablissement.modifier']), { rpc });
    fireEvent.click(screen.getByText(/entrer le code de licence/));
    fireEvent.change(screen.getByLabelText('Code d’activation'), { target: { value: 'ELITECOMAB12CD34' } });
    fireEvent.click(screen.getByText('Activer la licence'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/déjà utilisée/);
    cleanup();
  });
});
