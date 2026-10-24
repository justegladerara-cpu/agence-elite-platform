// @vitest-environment jsdom
// Page mobile d'un QR code vue par le client : blocs, boutons, menu, inscription ; logique du constructeur.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PageQr } from '../src/public/PageQr.jsx';
import { ajouter, chercherMenu, csvInscrits, deplacer, lienBouton, pageDeDepart, pictoRayon, rayonsMenu, retirer, titreCarteParDefaut } from '../src/modules/caisse/pageQr.js';
import { scansParJour } from '../src/modules/caisse/QrCodes.jsx';

afterEach(cleanup);

const PAGE = {
  couleur: '#0E9F6E', devise: 'XAF', logo: null,
  blocs: [
    { type: 'entete', titre: 'Bienvenue au bar' },
    { type: 'bouton', libelle: 'Notre Instagram', action: 'destination' },
    { type: 'bouton', libelle: 'WhatsApp', action: 'whatsapp', valeur: '242060000001', texte: 'Bonjour, je veux vos offres' },
    { type: 'menu', titre: 'Notre carte' },
    { type: 'formulaire', titre: 'Recevez nos offres', bouton: 'Je m’inscris', anniversaire: true },
  ],
  menu: [
    { id: 'b1', nom: 'Boissons', articles: [{ id: 'a1', nom: 'Bière fictive', prix: 1000 }] },
    { id: 'autres', nom: 'Autres', articles: [{ id: 'a2', nom: 'Brochette fictive', prix: 1500, description: 'Bœuf grillé' }] },
  ],
};

describe('page vue par le client', () => {
  test('boutons, menu et inscription', async () => {
    const onInscrire = vi.fn(async () => ({ merci: 'Merci, à bientôt !' }));
    render(<PageQr page={PAGE} reponse={{ type: 'lien', cible: 'https://instagram.com/bar' }} origine="https://x.test/" onInscrire={onInscrire} />);
    expect(screen.getByRole('heading', { name: 'Bienvenue au bar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Notre Instagram' }).getAttribute('href')).toBe('https://instagram.com/bar');
    // Message tout prêt : WhatsApp s'ouvre avec le texte déjà écrit.
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/242060000001?text=Bonjour%2C%20je%20veux%20vos%20offres');
    // Menu en cartes : une carte par rayon ; toucher la carte montre ses articles, « Retour au menu » revient.
    expect(screen.queryByText('Bière fictive')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nos boissons/ }));
    expect(screen.getByText('Bière fictive')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retour au menu/ }));
    fireEvent.change(screen.getByLabelText('Chercher dans le menu'), { target: { value: 'boeuf' } });
    expect(screen.getByText('Brochette fictive')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Votre nom et prénom'), { target: { value: 'Client test' } });
    fireEvent.change(screen.getByLabelText('Votre numéro WhatsApp'), { target: { value: '+242 06 000 00 02' } });
    expect(screen.getByLabelText('Votre anniversaire (facultatif)')).toBeTruthy();
    expect(screen.queryByLabelText('Votre e-mail (facultatif)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Je m’inscris' }));
    await waitFor(() => expect(screen.getByText('Merci, à bientôt !')).toBeTruthy());
    expect(onInscrire.mock.calls[0][0]).toMatchObject({ nom: 'Client test', telephone: '+242 06 000 00 02', site: '' });
  });
});

describe('menu en cartes', () => {
  test('rayons rangés, titres, cachés ; recherche sans accents ; liste comme avant', () => {
    const menu = PAGE.menu;
    expect(rayonsMenu(menu, {}).map((r) => r.titre)).toEqual(['Nos boissons', 'Autres choix']);
    const r = rayonsMenu(menu, { ordre: ['autres', 'b1'], cartes: { b1: { titre: 'À boire' }, autres: { cache: true } } });
    expect(r.map((x) => x.titre)).toEqual(['À boire']);
    expect(rayonsMenu(menu, { ordre: ['autres'] }).map((x) => x.id)).toEqual(['autres', 'b1']);
    expect(chercherMenu(rayonsMenu(menu), 'BIERE').map((a) => a.nom)).toEqual(['Bière fictive']);
    expect(titreCarteParDefaut('Bières')).toBe('Nos bières');
    expect(titreCarteParDefaut('Whisky')).toBe('Whisky');
    expect(pictoRayon('Bières pression')).toBe('🍺');
    const photos = vi.fn(async () => ({ a1: 'data:image/png;base64,AAAA' }));
    render(<PageQr page={{ ...PAGE, blocs: [{ type: 'menu', affichage: 'liste' }] }} reponse={null} chargerPhotos={photos} />);
    expect(screen.getByText('Bière fictive')).toBeTruthy();
    expect(screen.getByText('Brochette fictive')).toBeTruthy();
  });

  test('photos des articles chargées à l’ouverture du rayon', async () => {
    const photos = vi.fn(async () => ({ a1: 'data:image/png;base64,AAAA' }));
    const page = { ...PAGE, blocs: [{ type: 'menu' }], menu: [{ id: 'b1', nom: 'Boissons', articles: [{ id: 'a1', nom: 'Bière fictive', prix: 1000, a_photo: true }] }] };
    const { container } = render(<PageQr page={page} reponse={null} chargerPhotos={photos} />);
    expect(photos).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Nos boissons/ }));
    await waitFor(() => expect(container.querySelector('.page-qr-article-photo')).toBeTruthy());
    expect(photos).toHaveBeenCalledWith('b1');
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
