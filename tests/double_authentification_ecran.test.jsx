import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import DoubleAuthentification, { modeDoubleAuth } from '../src/auth/DoubleAuthentification.jsx';

afterEach(cleanup);

const equipe = (x = {}) => ({ connecte: true, equipe: true, facteur_verifie: false, double_auth_requise: false, enrolement_requis: false, reconnexion_requise: false, ...x });

function faussesDonnees({ verifier = async () => {}, facteurs = [{ id: 'f1' }] } = {}) {
  return {
    rpc: vi.fn(async () => null),
    mfa: {
      facteurs: vi.fn(async () => facteurs),
      enroler: vi.fn(async () => ({ id: 'nouveau', qr: 'data:image/svg+xml;utf-8,<svg/>', secret: 'CLESECRETE' })),
      verifier: vi.fn(verifier),
      fermerAutresSessions: vi.fn(async () => {}),
    },
  };
}

describe('mode de l’écran de double authentification', () => {
  test('6. les utilisateurs ordinaires ne voient jamais cet écran', () => {
    expect(modeDoubleAuth({ connecte: true, equipe: false, double_auth_requise: false })).toBeNull();
    expect(modeDoubleAuth(null)).toBeNull();
  });
  test('équipe : code, enrôlement obligatoire, proposition, reconnexion', () => {
    expect(modeDoubleAuth(equipe({ facteur_verifie: true, double_auth_requise: true }))).toBe('verifier');
    expect(modeDoubleAuth(equipe({ enrolement_requis: true }))).toBe('enroler');
    expect(modeDoubleAuth(equipe())).toBe('proposer');
    expect(modeDoubleAuth(equipe(), { plusTard: true })).toBeNull();
    expect(modeDoubleAuth(equipe({ facteur_verifie: true }))).toBeNull();
    expect(modeDoubleAuth(equipe({ reconnexion_requise: true, double_auth_requise: true }))).toBe('reconnexion');
  });
  test('mode local (démo sans Supabase Auth) : aucun écran', () => {
    expect(modeDoubleAuth(equipe({ enrolement_requis: true }), { mfaDisponible: false })).toBeNull();
  });
});

describe('écran', () => {
  test('code accepté : session renouvelée puis rechargement, événement journalisé', async () => {
    const donnees = faussesDonnees();
    const onFait = vi.fn();
    render(<DoubleAuthentification mode="verifier" donnees={donnees} onFait={onFait} onDeconnexion={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Code à 6 chiffres/), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(onFait).toHaveBeenCalled());
    expect(donnees.mfa.verifier).toHaveBeenCalledWith('f1', '123 456');
    expect(donnees.rpc).toHaveBeenCalledWith('journaliser_securite', { p_evenement: 'mfa_code_accepte', p_details: {} });
  });

  test('code refusé : message, aucun accès, refus journalisé', async () => {
    const donnees = faussesDonnees({ verifier: async () => { throw new Error('Code incorrect ou expiré'); } });
    const onFait = vi.fn();
    render(<DoubleAuthentification mode="verifier" donnees={donnees} onFait={onFait} onDeconnexion={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Code à 6 chiffres/), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Code incorrect/);
    expect(onFait).not.toHaveBeenCalled();
    expect(donnees.rpc).toHaveBeenCalledWith('journaliser_securite', { p_evenement: 'mfa_code_refuse', p_details: {} });
  });

  test('enrôlement : QR, code, puis fermeture des autres sessions', async () => {
    const donnees = faussesDonnees();
    const onFait = vi.fn();
    render(<DoubleAuthentification mode="enroler" donnees={donnees} onFait={onFait} onDeconnexion={() => {}} />);
    expect(screen.queryByText('Plus tard')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Activer maintenant' }));
    expect(await screen.findByAltText(/Code QR/)).toBeTruthy();
    expect(screen.queryByText('CLESECRETE')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Code à 6 chiffres/), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Valider et activer' }));
    await waitFor(() => expect(onFait).toHaveBeenCalled());
    expect(donnees.mfa.verifier).toHaveBeenCalledWith('nouveau', '654321');
    expect(donnees.mfa.fermerAutresSessions).toHaveBeenCalled();
  });

  test('proposition en transition : « Plus tard » possible', () => {
    const onPlusTard = vi.fn();
    render(<DoubleAuthentification mode="proposer" donnees={faussesDonnees()} onFait={() => {}} onPlusTard={onPlusTard} onDeconnexion={() => {}} />);
    fireEvent.click(screen.getByText('Plus tard'));
    expect(onPlusTard).toHaveBeenCalled();
  });

  test('7. session révoquée : déconnexion avec le message « session expirée »', () => {
    const onDeconnexion = vi.fn();
    render(<DoubleAuthentification mode="reconnexion" donnees={faussesDonnees()} onFait={() => {}} onDeconnexion={onDeconnexion} />);
    expect(onDeconnexion).toHaveBeenCalledWith('expiree');
  });
});
