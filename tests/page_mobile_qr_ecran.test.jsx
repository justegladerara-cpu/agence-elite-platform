// @vitest-environment jsdom
// Page mobile d'un QR code vue par le client : blocs, boutons, menu, inscription ; logique du constructeur.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PageQr } from '../src/public/PageQr.jsx';
import { ajouter, csvInscrits, deplacer, lienBouton, pageDeDepart, retirer } from '../src/modules/caisse/pageQr.js';
import { scansParJour } from '../src/modules/caisse/QrCodes.jsx';

afterEach(cleanup);

const PAGE = {
  couleur: '#0E9F6E', devise: 'XAF', logo: null,
  blocs: [
    { type: 'entete', titre: 'Bienvenue au bar' },
    { type: 'bouton', libelle: 'Notre Instagram', action: 'destination' },
    { type: 'bouton', libelle: 'WhatsApp', action: 'whatsapp', valeur: '242060000001' },
    { type: 'menu', titre: 'Notre carte' },
    { type: 'formulaire', titre: 'Recevez nos offres', bouton: 'Je m’inscris', anniversaire: true },
  ],
  menu: [{ nom: 'Boissons', articles: [{ nom: 'Bière fictive', prix: 1000 }] }],
};

describe('page vue par le client', () => {
  test('boutons, menu et inscription', async () => {
    const onInscrire = vi.fn(async () => ({ merci: 'Merci, à bientôt !' }));
    render(<PageQr page={PAGE} reponse={{ type: 'lien', cible: 'https://instagram.com/bar' }} origine="https://x.test/" onInscrire={onInscrire} />);
    expect(screen.getByRole('heading', { name: 'Bienvenue au bar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Notre Instagram' }).getAttribute('href')).toBe('https://instagram.com/bar');
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/242060000001');
    expect(screen.getByText('Bière fictive')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre nom et prénom'), { target: { value: 'Client test' } });
    fireEvent.change(screen.getByLabelText('Votre numéro WhatsApp'), { target: { value: '+242 06 000 00 02' } });
    expect(screen.getByLabelText('Votre anniversaire (facultatif)')).toBeTruthy();
    expect(screen.queryByLabelText('Votre e-mail (facultatif)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Je m’inscris' }));
    await waitFor(() => expect(screen.getByText('Merci, à bientôt !')).toBeTruthy());
    expect(onInscrire.mock.calls[0][0]).toMatchObject({ nom: 'Client test', telephone: '+242 06 000 00 02', site: '' });
  });
});

describe('constructeur', () => {
  test('page de départ, ajouter, déplacer, retirer, un seul formulaire', () => {
    let b = pageDeDepart({ type: 'lien', nom: 'Instagram' }, 'Le Bar');
    expect(b.map((x) => x.type)).toEqual(['entete', 'bouton', 'menu', 'formulaire']);
    expect(b[0].titre).toBe('Bienvenue chez Le Bar');
    expect(ajouter(b, 'formulaire')).toBe(b);
    b = ajouter(b, 'texte');
    expect(b.at(-1).type).toBe('texte');
    b = deplacer(b, b.length - 1, -1);
    expect(b.at(-2).type).toBe('texte');
    expect(retirer(b, 0)[0].type).toBe('bouton');
    expect(pageDeDepart({ type: 'menu' }).map((x) => x.type)).toEqual(['entete', 'menu', 'formulaire']);
  });

  test('liens des boutons : jamais de lien dangereux', () => {
    expect(lienBouton({ action: 'lien', valeur: 'javascript:alert(1)' })).toBeNull();
    expect(lienBouton({ action: 'lien', valeur: 'https://facebook.com/bar' })).toBe('https://facebook.com/bar');
    expect(lienBouton({ action: 'appel', valeur: '+242 06 000 00 01' })).toBe('tel:+242060000001');
    expect(lienBouton({ action: 'destination' }, null)).toBeNull();
    expect(lienBouton({ action: 'menu' })).toBe('#page-qr-menu');
  });

  test('export des inscrits et scans jour par jour', () => {
    const csv = csvInscrits([{ cree_le: '2026-10-23T10:00:00Z', nom: 'A; B', telephone: '242060000002', qr_code_id: 'q1' }], { q1: 'Tables' });
    expect(csv.split('\r\n')[1]).toBe('2026-10-23;"A; B";+242060000002;;;;Tables');
    const j = scansParJour([
      { scanne_le: '2026-10-22T10:00:00Z', appareil: 'mobile' }, { scanne_le: '2026-10-22T11:00:00Z', appareil: 'ordinateur' },
      { scanne_le: '2026-10-23T09:00:00Z', appareil: 'mobile' },
    ]);
    expect(j).toEqual([
      { jour: '2026-10-23', total: 1, mobile: 1, tablette: 0, ordinateur: 0, inconnu: 0 },
      { jour: '2026-10-22', total: 2, mobile: 1, tablette: 0, ordinateur: 1, inconnu: 0 },
    ]);
  });
});
