import React from 'react';
// @vitest-environment jsdom
// CRM Agence Elite (porte unique) : réservé au Super Admin, ouvert avec le jeton de session dans l'adresse.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FournisseurEspace } from '../src/noyau/espace.jsx';
import CrmEditeur, { ADRESSE_CRM, lienPorteCrm } from '../src/modules/editeur/CrmEditeur.jsx';
import { MENU_EDITEUR } from '../src/modules/editeur/EspaceEditeur.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ecran = (roleEditeur, api) =>
  render(
    <FournisseurEspace api={api} contexte={{ etablissements: [], editeur: roleEditeur, compte: {}, utilisateur: {} }}>
      <CrmEditeur />
    </FournisseurEspace>
  );

describe('CRM Agence Elite (porte unique)', () => {
  test('le menu le réserve au Super Admin', () => {
    expect(MENU_EDITEUR.find((m) => m.id === 'editeur/crm')?.superAdmin).toBe(true);
  });

  test('le menu ne montre plus que l’administration dans le CRM ; les autres écrans restent en secours', () => {
    expect(MENU_EDITEUR.filter((m) => !m.secours).map((m) => m.id)).toEqual(['editeur']);
    expect(MENU_EDITEUR.filter((m) => m.secours).map((m) => m.id)).toContain('editeur/clients');
  });

  test('le lien porte le jeton dans le fragment (jamais envoyé au serveur)', () => {
    expect(ADRESSE_CRM).toBe('https://crm.agence-elite.fr/');
    expect(lienPorteCrm('a.b+c')).toBe('https://crm.agence-elite.fr/#porte=a.b%2Bc');
  });

  test('un administrateur (non Super Admin) ne voit pas le bouton', () => {
    const jeton = vi.fn();
    ecran('admin', { jeton });
    expect(screen.queryByText('Ouvrir le CRM')).toBeNull();
    expect(jeton).not.toHaveBeenCalled();
  });

  test('le Super Admin ouvre le CRM avec son jeton', async () => {
    const fenetre = { location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => fenetre));
    ecran('super_admin', { jeton: async () => 'jeton-1' });
    fireEvent.click(screen.getByText('Ouvrir le CRM'));
    await waitFor(() => expect(fenetre.location.href).toBe('https://crm.agence-elite.fr/#porte=jeton-1'));
    expect(fenetre.opener).toBeNull();
  });

  test('session expirée : message clair et fenêtre refermée', async () => {
    const fenetre = { location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => fenetre));
    ecran('super_admin', { jeton: async () => null });
    fireEvent.click(screen.getByText('Ouvrir le CRM'));
    await screen.findByText(/Session expirée/);
    expect(fenetre.close).toHaveBeenCalled();
    expect(fenetre.location.href).toBe('');
  });
});
