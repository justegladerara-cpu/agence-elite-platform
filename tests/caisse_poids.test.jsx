// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  classerFavoris, compterVente, enregistrerFavoris, estVenteAuPoids, lireFavoris, quantitePourMontant, cleFavoris,
} from '../src/modules/caisse/poids.js';
import { lienRecuWhatsApp, numeroWhatsApp, texteRecuWhatsApp } from '../src/modules/recus/whatsapp.js';

// Espace minimal pour afficher les fenêtres de la caisse sans base.
const espace = {
  api: { rpc: vi.fn() },
  etablissement: { id: 'etab-test' },
  devise: 'XAF',
  montant: (n) => `${n} F`,
  peut: () => true,
};
vi.mock('../src/noyau/espace.jsx', () => ({ useEspace: () => espace, useDonnees: () => ({}) }));

const { ClientRapide, ModaleCombien } = await import('../src/modules/caisse/Caisse.jsx');
const { AnnulationRapide, DELAI_ANNULATION_RAPIDE } = await import('../src/modules/recus/Recu.jsx');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('vente au poids', () => {
  test('unités de poids, volume et longueur ; pas les pièces', () => {
    for (const u of ['kg', 'KG', 'g', 'gramme', 'Grammes', 'litre', 'l', 'L', 'cl', 'ml', 'mètre', 'm', 'Kg.']) expect(estVenteAuPoids(u)).toBe(true);
    for (const u of ['unité', 'pièce', 'sac', 'carton', 'paquet', '', null, undefined]) expect(estVenteAuPoids(u)).toBe(false);
  });

  test('pour un montant : quantité = montant / prix, 3 décimales', () => {
    expect(quantitePourMontant(500, 2500)).toBe(0.2);
    expect(quantitePourMontant(1000, 3000)).toBe(0.333);
    expect(quantitePourMontant('', 2500)).toBe(0);
    expect(quantitePourMontant(500, 0)).toBe(0);
  });

  test('« Combien ? » : gros boutons dans l’unité, autre poids, pour un montant', () => {
    const onValider = vi.fn();
    render(<ModaleCombien article={{ id: 'a', nom: 'Poulet', unite: 'kg', prix_vente: 2500 }} onValider={onValider} onFermer={() => {}} />);
    fireEvent.click(screen.getByText('½ kg'));
    expect(onValider).toHaveBeenLastCalledWith(0.5);
    fireEvent.change(screen.getByPlaceholderText('Ex. 500'), { target: { value: '500' } });
    expect(screen.getByRole('status').textContent).toContain('0,2 kg');
    fireEvent.click(screen.getByText('Ajouter au panier'));
    expect(onValider).toHaveBeenLastCalledWith(0.2);
    fireEvent.change(screen.getByPlaceholderText('Ex. 1,5'), { target: { value: '1.25' } });
    fireEvent.click(screen.getByText('Ajouter au panier'));
    expect(onValider).toHaveBeenLastCalledWith(1.25);
  });
});

describe('favoris', () => {
  test('les plus vendus d’abord, 12 au plus, articles archivés ignorés', () => {
    const compteurs = { a: 3, b: 10, c: 3, x: 50, d: 0 };
    expect(classerFavoris(compteurs, ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c']);
    const beaucoup = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, i + 1]));
    const top = classerFavoris(beaucoup, Object.keys(beaucoup));
    expect(top).toHaveLength(12);
    expect(top[0]).toBe('p19');
  });

  test('une vente ajoute, une annulation retire', () => {
    let c = compterVente({}, [{ article_id: 'a', quantite: 2 }, { article_id: 'b', quantite: 0.5 }]);
    c = compterVente(c, [{ article_id: 'b', quantite: 0.25 }]);
    expect(c).toEqual({ a: 2, b: 0.75 });
    expect(compterVente(c, [{ article_id: 'a', quantite: 2 }], -1)).toEqual({ b: 0.75 });
  });

  test('stockage par établissement, données abîmées ou stockage bloqué sans erreur', () => {
    localStorage.clear();
    enregistrerFavoris('e1', { a: 1 });
    expect(lireFavoris('e1')).toEqual({ a: 1 });
    expect(lireFavoris('e2')).toEqual({});
    localStorage.setItem(cleFavoris('e1'), '{abîmé');
    expect(lireFavoris('e1')).toEqual({});
    const espion = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    expect(lireFavoris('e1')).toEqual({});
    espion.mockRestore();
  });
});

describe('reçu WhatsApp', () => {
  const recu = {
    vente: { numero: 'V-0042', cree_le: '2026-10-11T10:00:00Z', total: 3500, montant_paye: 2000, remise: 0, statut: 'validee' },
    etablissement: { nom: 'Commerce Démo', devise: 'XAF' },
    identite: { nom_commercial: 'Boutique Démo' },
    contact: { nom: 'Client Test', telephone: '06 123 45 67' },
    lignes: [{ libelle: 'Poulet', quantite: 0.5, prix_unitaire: 5000, total: 2500 }, { libelle: 'Pain', quantite: 2, prix_unitaire: 500, total: 1000 }],
    paiements: [{ mode: 'especes', montant: 2000, statut: 'valide' }],
  };

  test('texte court : boutique, numéro, lignes, total, payé, reste dû, merci', () => {
    const t = texteRecuWhatsApp(recu);
    expect(t).toContain('*Boutique Démo*');
    expect(t).toContain('V-0042');
    expect(t).toMatch(/Poulet : 0,5 × 5 000 FCFA = 2 500 FCFA/);
    expect(t).toMatch(/Total : 3 500 FCFA/);
    expect(t).toMatch(/Payé : 2 000 FCFA/);
    expect(t).toMatch(/Reste dû : 1 500 FCFA/);
    expect(t).toContain('Merci');
    expect(texteRecuWhatsApp({ ...recu, vente: { ...recu.vente, montant_paye: 3500 } })).not.toContain('Reste dû');
  });

  test('numéro du contact, sinon wa.me sans numéro', () => {
    expect(numeroWhatsApp('06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsApp('+242 06 123 45 67')).toBe('242061234567');
    expect(numeroWhatsApp('00242061234567')).toBe('242061234567');
    expect(lienRecuWhatsApp(recu).startsWith('https://wa.me/242061234567?text=')).toBe(true);
    expect(lienRecuWhatsApp({ ...recu, contact: null }).startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('oups, annuler', () => {
  test('deux touches pour annuler ; le bouton disparaît après 15 secondes', async () => {
    vi.useFakeTimers();
    const onAnnuler = vi.fn().mockResolvedValue();
    const { unmount } = render(<AnnulationRapide onAnnuler={onAnnuler} />);
    fireEvent.click(screen.getByText('Oups, annuler cette vente'));
    expect(onAnnuler).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByText('Oui, annuler la vente')); });
    expect(onAnnuler).toHaveBeenCalledTimes(1);
    unmount();
    render(<AnnulationRapide onAnnuler={onAnnuler} />);
    act(() => { vi.advanceTimersByTime(DELAI_ANNULATION_RAPIDE + 10); });
    expect(screen.queryByText('Oups, annuler cette vente')).toBeNull();
  });
});

describe('nouveau client rapide', () => {
  test('un numéro suffit : il sert de nom', async () => {
    espace.api.rpc.mockResolvedValue('contact-1');
    const onCree = vi.fn();
    render(<ClientRapide onCree={onCree} />);
    fireEvent.click(screen.getByText('Nouveau client'));
    fireEvent.change(screen.getByPlaceholderText('06 123 45 67'), { target: { value: '06 000 00 01' } });
    await act(async () => { fireEvent.click(screen.getByText('Créer et choisir')); });
    expect(espace.api.rpc).toHaveBeenCalledWith('enregistrer_contact', {
      p_etablissement_id: 'etab-test', p_contact: { type: 'client', nom: '06 000 00 01', telephone: '06 000 00 01' },
    });
    expect(onCree).toHaveBeenCalledWith({ id: 'contact-1', type: 'client', nom: '06 000 00 01', telephone: '06 000 00 01' });
  });
});
