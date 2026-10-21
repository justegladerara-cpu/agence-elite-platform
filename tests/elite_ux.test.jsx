// @vitest-environment jsdom
import React, { useState } from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { formatMontant, formatMontantCourt, montantCourtDepuisTexte } from '../src/noyau/format.js';
import { basculerFavori, lireFavoris, lireHistorique, MAX_FAVORIS, noterPageOuverte } from '../src/noyau/menuEssentiel.js';
import { ongletsTelephone } from '../src/ui/Navigation.jsx';
import { Champ, ChiffreCle, StatCard, Tabs } from '../src/ui/composants.jsx';

// Elite UX 2.0 : affichage seulement. Montants lisibles, champs accessibles, onglets au clavier, favoris, barre du téléphone.
afterEach(cleanup);

const texte = (s) => s.replace(/\s/g, ' ');

describe('montants longs', () => {
  test.each([
    [0, '0 FCFA', '0 FCFA'],
    [500, '500 FCFA', '500 FCFA'],
    [25_000, '25 000 FCFA', '25 000 FCFA'],
    [1_250_000, '1 250 000 FCFA', '1,25 M FCFA'],
    [125_750_000, '125 750 000 FCFA', '125,8 M FCFA'],
    [12_345_678_900, '12 345 678 900 FCFA', '12,35 Md FCFA'],
  ])('%d XAF : complet « %s », court « %s »', (n, complet, court) => {
    expect(texte(formatMontant(n, 'XAF'))).toBe(complet);
    expect(texte(formatMontantCourt(n, 'XAF'))).toBe(court);
  });

  test('la forme courte se déduit du texte affiché, seulement pour un montant d’au moins 100 000', () => {
    expect(texte(montantCourtDepuisTexte('125 750 000 FCFA'))).toBe('125,8 M FCFA');
    expect(montantCourtDepuisTexte('25 000 FCFA')).toBeNull();
    expect(montantCourtDepuisTexte('12 ventes')).toBeNull();
    expect(texte(formatMontantCourt(-1_250_000, 'XAF'))).toBe('-1,25 M FCFA');
  });

  test('le chiffre clé garde la valeur complète lisible (texte direct) et ajoute la forme courte pour l’écran étroit', () => {
    render(<ChiffreCle className="kpi-valeur">125 750 000 FCFA</ChiffreCle>);
    const el = screen.getByText('125 750 000 FCFA');
    expect(el.className).toContain('chiffre-cle');
    const court = el.querySelector('.chiffre-court');
    expect(court.getAttribute('aria-hidden')).toBe('true');
    expect(texte(court.textContent)).toBe('125,8 M FCFA');
  });

  test('petit montant : pas de forme courte', () => {
    render(<StatCard libelle="Ventes" valeur="25 000 FCFA" />);
    const el = screen.getByText('25 000 FCFA', { selector: '.stat-card-valeur' });
    expect(el.querySelector('.chiffre-court')).toBeNull();
  });
});

describe('champs de formulaire', () => {
  test('aide et erreur reliées au champ, erreur annoncée', () => {
    render(<Champ libelle="Prix" aide="En FCFA" erreur="Le prix est obligatoire"><input required /></Champ>);
    const champ = screen.getByLabelText(/Prix/);
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    const decrit = champ.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent.trim());
    expect(decrit).toEqual(['En FCFA', 'Le prix est obligatoire']);
    expect(screen.getByRole('alert').textContent).toContain('Le prix est obligatoire');
  });

  test('sans erreur : rien d’invalide', () => {
    render(<Champ libelle="Nom"><input /></Champ>);
    expect(screen.getByLabelText('Nom').getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('onglets au clavier', () => {
  function Essai() {
    const [actif, setActif] = useState('a');
    return <Tabs actif={actif} onChange={setActif} onglets={[['a', 'Jour'], ['b', 'Semaine'], ['c', 'Mois']]} />;
  }

  test('flèches, Début et Fin changent d’onglet ; un seul onglet dans l’ordre de tabulation', () => {
    render(<Essai />);
    const jour = screen.getByRole('tab', { name: 'Jour' });
    expect(jour.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Mois' }).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(jour, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Semaine' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Semaine' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Mois' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Mois' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Jour' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('favoris, historique et barre du téléphone', () => {
  beforeEach(() => window.localStorage.clear());

  test('une étoile ajoute puis retire ; 8 favoris au plus', () => {
    expect(basculerFavori('stock')).toEqual(['stock']);
    expect(basculerFavori('stock')).toEqual([]);
    for (let i = 0; i < MAX_FAVORIS + 2; i += 1) basculerFavori(`e${i}`);
    expect(lireFavoris()).toHaveLength(MAX_FAVORIS);
  });

  test('l’historique garde les derniers écrans ouverts, sans doublon', () => {
    for (const id of ['caisse', 'ventes', 'caisse', 'stock']) noterPageOuverte(id);
    expect(lireHistorique()).toEqual(['stock', 'caisse', 'ventes']);
  });

  const page = (id) => ({ id, libelle: id, icone: 'tableau' });

  test('barre du téléphone : favoris d’abord, puis les écrans du quotidien ; 4 places', () => {
    const pages = ['accueil', 'caisse', 'ventes', 'stock', 'contacts', 'agenda'].map(page);
    expect(ongletsTelephone(pages).map((p) => p.id)).toEqual(['accueil', 'caisse', 'ventes', 'stock']);
    expect(ongletsTelephone(pages, ['agenda']).map((p) => p.id)).toEqual(['agenda', 'accueil', 'caisse', 'ventes']);
  });

  test('barre du téléphone : jamais un écran non autorisé, même s’il est en favori', () => {
    const pages = ['accueil', 'ventes'].map(page);
    expect(ongletsTelephone(pages, ['caisse', 'parametres']).map((p) => p.id)).toEqual(['accueil', 'ventes']);
  });
});

// Le CSS d'un module est chargé pour tout le logiciel : jamais de sélecteur nu sur body, html ou *.
function fichiersCss(dossier) {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersCss(chemin);
    return nom.endsWith('.css') ? [chemin] : [];
  });
}

describe('CSS des modules', () => {
  const fichiers = fichiersCss('src/modules');
  test.each(fichiers)('%s : aucun sélecteur nu body, html ou *', (fichier) => {
    const css = readFileSync(fichier, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selecteurs = [...css.matchAll(/([^{};]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@'));
    for (const groupe of selecteurs) {
      for (const s of groupe.split(',').map((x) => x.trim())) {
        expect(s, `${fichier} : « ${s} »`).not.toMatch(/^(body|html|\*)(\s|$|::?[a-z-]+$|\s*>)/);
      }
    }
  });
});
