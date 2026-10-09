import React from 'react';
// @vitest-environment jsdom
// Sites clients rattachés (Express Congo) : appels avec le jeton de session, CSP et écran Super Admin.
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FournisseurEspace } from '../src/noyau/espace.jsx';
import { SITES_CLIENTS, appelerSite, trouverSite } from '../src/noyau/sites.js';
import SitesEditeur from '../src/modules/editeur/SitesEditeur.jsx';
import { MENU_EDITEUR } from '../src/modules/editeur/EspaceEditeur.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const site = trouverSite('express-congo');

describe('registre et sécurité', () => {
  test('chaque site a une adresse https et figure dans connect-src de la CSP', () => {
    const csp = readFileSync('public/_headers', 'utf8');
    expect(new Set(SITES_CLIENTS.map((s) => s.id)).size).toBe(SITES_CLIENTS.length);
    for (const s of SITES_CLIENTS) {
      expect(s.adresse).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      expect(csp).toMatch(new RegExp(`connect-src [^;]*${s.adresse.replace(/\./g, '\\.')}`));
    }
  });

  test('la section est réservée au Super Admin dans le menu', () => {
    expect(MENU_EDITEUR.find((m) => m.id === 'editeur/sites')?.superAdmin).toBe(true);
  });

  test('appel avec le jeton, barre finale obligatoire, erreurs lisibles', async () => {
    const appels = [];
    const f = async (url, init) => {
      appels.push([url, init]);
      return Response.json({ ok: true });
    };
    await appelerSite(site, 'comptes', { jeton: 'jeton-session', methode: 'POST', corps: { action: 'revoke', id: 'x' }, f });
    expect(appels[0][0]).toBe('https://express-congo.justegladerara.workers.dev/api/plateforme/comptes/');
    expect(appels[0][1].headers.authorization).toBe('Bearer jeton-session');
    expect(JSON.parse(appels[0][1].body)).toEqual({ action: 'revoke', id: 'x' });
    await expect(appelerSite(site, 'etat', { jeton: null, f })).rejects.toThrow(/Session expirée/);
    await expect(appelerSite(site, 'etat', { jeton: 'j', f: async () => Response.json({ erreur: 'Réservé' }, { status: 403 }) })).rejects.toThrow('Réservé');
    await expect(appelerSite(site, 'etat', { jeton: 'j', f: async () => { throw new TypeError('Failed to fetch'); } })).rejects.toThrow(/ne répond pas/);
  });
});

// Faux site Express Congo répondant à l'API d'administration.
function fauxSite() {
  const requetes = [];
  const comptes = [
    { id: 'equipe-1', email: 'agent@example.invalid', role: 'agent', agency: 'paris', verified: true, disabled: false, publicDemo: false, platform: false, activeSessions: 1 },
    { id: 'admin-demo', email: 'admin@example.invalid', role: 'admin', agency: 'paris', verified: true, disabled: false, publicDemo: true, platform: false, activeSessions: 0 },
  ];
  const etat = {
    environment: 'demo',
    access: { demoPublic: true },
    counts: { accounts: 2, activeSessions: 1, shipment: 8, parcel: 7, departure: 3, quotes: 4, proposal: 5 },
    payments: { methods: ['transfer'], online: [] },
    lastActivity: '2026-10-09T16:00:00.000Z',
  };
  const f = vi.fn(async (url, init = {}) => {
    const chemin = new URL(url).pathname;
    requetes.push([init.method ?? 'GET', chemin, init.body ? JSON.parse(init.body) : null, init.headers?.authorization]);
    if (chemin === '/api/plateforme/etat/') return Response.json(etat);
    if (chemin === '/api/plateforme/comptes/' && (init.method ?? 'GET') === 'GET') return Response.json({ comptes });
    if (chemin === '/api/plateforme/comptes/') return Response.json({ id: 'equipe-2', link: 'https://express-congo.example/demo/?reinitialiser=abc', expiresInHours: 72 });
    if (chemin === '/api/plateforme/acces/') {
      etat.access.demoPublic = JSON.parse(init.body).demoPublic;
      return Response.json({ access: etat.access });
    }
    return Response.json({ erreur: 'Introuvable' }, { status: 404 });
  });
  return { f, requetes };
}

function rendre(roleEditeur, route = 'express-congo') {
  const api = { jeton: async () => 'jeton-super-admin' };
  return render(
    <FournisseurEspace api={api} contexte={{ etablissements: [], editeur: roleEditeur, compte: {}, utilisateur: {} }}>
      <SitesEditeur siteId={route} naviguer={() => {}} />
    </FournisseurEspace>
  );
}

describe('écran Sites clients', () => {
  test('un administrateur (non Super Admin) ne voit rien et n’appelle pas le site', () => {
    const { f } = fauxSite();
    vi.stubGlobal('fetch', f);
    rendre('admin');
    expect(screen.getByText(/Réservé à la direction/)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });

  test('le Super Admin voit l’état, crée un compte et ferme la démo publique', async () => {
    const { f, requetes } = fauxSite();
    vi.stubGlobal('fetch', f);
    rendre('super_admin');
    await screen.findByText('agent@example.invalid');
    expect(screen.getByText('Compte public de démonstration')).toBeTruthy();
    expect(requetes.every((r) => r[3] === 'Bearer jeton-super-admin')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Nouveau compte/ }));
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'nouvel.agent@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer et obtenir le lien/ }));
    await screen.findByDisplayValue('https://express-congo.example/demo/?reinitialiser=abc');
    expect(requetes.find((r) => r[0] === 'POST' && r[1] === '/api/plateforme/comptes/')[2]).toEqual({
      action: 'create', email: 'nouvel.agent@example.invalid', role: 'agent', agency: 'paris',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Terminé' }));

    fireEvent.click(screen.getByRole('tab', { name: /Accès/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer la démo publique' }));
    await waitFor(() => expect(requetes.some((r) => r[1] === '/api/plateforme/acces/' && r[2]?.demoPublic === false)).toBe(true));
  });

  test('site injoignable : message clair, aucune action possible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    rendre('super_admin');
    expect(await screen.findByText('Le site ne répond pas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ouvrir la gestion/ }).disabled).toBe(true);
  });
});
