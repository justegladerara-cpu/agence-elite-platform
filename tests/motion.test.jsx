// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CHOIX_ANIMATIONS, appliquerAnimations, enregistrerChoixAnimations, lireChoixAnimations, niveauCourant, niveauEffectif, suivreSysteme,
} from '../src/motion/preferences.js';
import { decimalesDe, interpoler, sortieCubique, useNombreAnime } from '../src/motion/nombre.js';
import { clesNouvelles } from '../src/motion/lignes.js';
import { NombreAnime } from '../src/motion/NombreAnime.jsx';
import { Bouton, DataTable, Modale } from '../src/ui/composants.jsx';
import { formatMontant } from '../src/noyau/format.js';

// Elite Motion System : préférences, mouvement réduit, compteur exact, nettoyage, composants partagés.
// Données fictives uniquement.

// Images d'animation pilotées à la main : chaque appel à image(ms) avance l'horloge et joue les rappels en attente.
let file = [];
let horloge = 0;
function image(ms = 16) {
  horloge += ms;
  const rappels = file;
  file = [];
  act(() => { rappels.forEach(([, f]) => f(horloge)); });
}

beforeEach(() => {
  file = [];
  horloge = 0;
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (f) => { id += 1; file.push([id, f]); return id; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn((n) => { file = file.filter(([i]) => i !== n); }));
  document.documentElement.dataset.animations = 'equilibre';
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.animations;
  delete document.documentElement.dataset.pageCachee;
});

describe('préférences d’animation', () => {
  test('« auto » suit le système ; un choix explicite est gardé, sans mouvement si le système le refuse', () => {
    expect(niveauEffectif('auto', false)).toBe('equilibre');
    expect(niveauEffectif('auto', true)).toBe('reduit');
    expect(niveauEffectif('complet', false)).toBe('complet');
    expect(niveauEffectif('complet', true)).toBe('leger');
    expect(niveauEffectif('equilibre', true)).toBe('leger');
    expect(niveauEffectif('leger', true)).toBe('leger');
    expect(niveauEffectif('reduit', false)).toBe('reduit');
    expect(niveauEffectif('n’importe quoi', false)).toBe('equilibre');
  });

  test('valeur abîmée ou stockage indisponible : « auto »', () => {
    localStorage.setItem('ae-animations', 'turbo');
    expect(lireChoixAnimations()).toBe('auto');
    expect(lireChoixAnimations({ getItem: () => { throw new Error('bloqué'); } })).toBe('auto');
    expect(CHOIX_ANIMATIONS.map(([v]) => v)).toEqual(['auto', 'complet', 'equilibre', 'leger', 'reduit']);
  });

  test('enregistrer pose le niveau sur <html> ; « auto » efface le choix', () => {
    expect(enregistrerChoixAnimations('reduit')).toBe('reduit');
    expect(localStorage.getItem('ae-animations')).toBe('reduit');
    expect(document.documentElement.dataset.animations).toBe('reduit');
    expect(niveauCourant()).toBe('reduit');
    enregistrerChoixAnimations('auto');
    expect(localStorage.getItem('ae-animations')).toBeNull();
    expect(document.documentElement.dataset.animations).toBe('equilibre');
  });

  test('« Réduire les animations » du système : aucun mouvement en « auto »', () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
    expect(appliquerAnimations('auto')).toBe('reduit');
    expect(document.documentElement.dataset.animations).toBe('reduit');
  });

  test('sans niveau posé (tests, ancien navigateur), le niveau courant est prudent : réduit', () => {
    delete document.documentElement.dataset.animations;
    expect(niveauCourant()).toBe('reduit');
  });

  test('onglet caché : pause des boucles ; arrêt du suivi : écouteurs retirés', () => {
    let etat = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
    const arreter = suivreSysteme(window);
    etat = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.dataset.pageCachee).toBe('oui');
    etat = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.dataset.pageCachee).toBeUndefined();
    arreter();
    etat = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.dataset.pageCachee).toBeUndefined();
    delete document.visibilityState;
  });
});

describe('compteur animé', () => {
  test('interpolation : la fin est la valeur exacte, les étapes ont les décimales des vraies valeurs', () => {
    expect(interpoler(0, 1500, 1)).toBe(1500);
    expect(interpoler(0, 1500, 1.4)).toBe(1500);
    expect(interpoler(0, 1500, 0.5)).toBe(750);
    expect(interpoler(10, 13, 0.5)).toBe(12);
    expect(interpoler(0, 0.3, 0.5, decimalesDe(0, 0.3))).toBe(0.2);
    expect(decimalesDe(12.345, 1)).toBe(2);
    expect(sortieCubique(0)).toBe(0);
    expect(sortieCubique(1)).toBe(1);
  });

  function Essai({ valeur }) {
    const [v, enCours] = useNombreAnime(valeur, { duree: 300 });
    return <output data-en-cours={enCours ? 'oui' : 'non'}>{String(v)}</output>;
  }

  test('premier affichage : la valeur exacte tout de suite (jamais un comptage depuis 0)', () => {
    render(<Essai valeur={125000} />);
    expect(screen.getByRole('status').textContent).toBe('125000');
    expect(file).toHaveLength(0);
  });

  test('changement : valeurs intermédiaires entre les deux, puis exactement la nouvelle valeur', () => {
    const { rerender } = render(<Essai valeur={1000} />);
    rerender(<Essai valeur={2000} />);
    expect(screen.getByRole('status').textContent).toBe('1000');
    const vues = [];
    for (let i = 0; i < 30 && file.length; i += 1) {
      image(16);
      vues.push(Number(screen.getByRole('status').textContent));
    }
    expect(vues.slice(0, -1).every((v) => v >= 1000 && v <= 2000 && Number.isInteger(v))).toBe(true);
    expect(vues.at(-1)).toBe(2000);
    expect(screen.getByRole('status').dataset.enCours).toBe('non');
    expect(file).toHaveLength(0);
  });

  test('la valeur finale est la valeur reçue elle-même (texte de la base compris)', () => {
    const { rerender } = render(<Essai valeur="10.5" />);
    rerender(<Essai valeur="12.25" />);
    for (let i = 0; i < 40 && file.length; i += 1) image(16);
    expect(screen.getByRole('status').textContent).toBe('12.25');
  });

  test('changement pendant l’animation : repart de la valeur affichée et finit sur la dernière valeur', () => {
    const { rerender } = render(<Essai valeur={0} />);
    rerender(<Essai valeur={1000} />);
    image(16);
    image(100);
    const milieu = Number(screen.getByRole('status').textContent);
    expect(milieu).toBeGreaterThan(0);
    expect(milieu).toBeLessThan(1000);
    rerender(<Essai valeur={500} />);
    expect(Number(screen.getByRole('status').textContent)).toBe(milieu);
    for (let i = 0; i < 40 && file.length; i += 1) image(16);
    expect(screen.getByRole('status').textContent).toBe('500');
  });

  test('niveau réduit ou léger : aucune animation, la nouvelle valeur tout de suite', () => {
    for (const niveau of ['reduit', 'leger']) {
      document.documentElement.dataset.animations = niveau;
      function SansDuree({ valeur }) {
        const [v] = useNombreAnime(valeur);
        return <output>{String(v)}</output>;
      }
      const { rerender, unmount } = render(<SansDuree valeur={1} />);
      rerender(<SansDuree valeur={99} />);
      expect(screen.getByRole('status').textContent).toBe('99');
      expect(file).toHaveLength(0);
      unmount();
    }
  });

  test('retrait de l’écran pendant l’animation : l’image demandée est annulée', () => {
    const { rerender, unmount } = render(<Essai valeur={0} />);
    rerender(<Essai valeur={10} />);
    expect(file).toHaveLength(1);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(file).toHaveLength(0);
  });

  test('NombreAnime réutilise le format FCFA de l’application', () => {
    const format = (v) => formatMontant(v, 'XAF');
    const { rerender } = render(<NombreAnime valeur={1500} format={format} duree={200} />);
    expect(screen.getByText('1 500 FCFA')).toBeTruthy();
    rerender(<NombreAnime valeur={2500} format={format} duree={200} />);
    for (let i = 0; i < 30 && file.length; i += 1) image(16);
    expect(screen.getByText('2 500 FCFA')).toBeTruthy();
  });
});

describe('lignes nouvelles', () => {
  test('rien au premier chargement, les ajouts ensuite, rien pour un rechargement massif', () => {
    const l = (...ids) => ids.map((id) => ({ id }));
    expect(clesNouvelles(l(1, 2), null)).toEqual([]);
    expect(clesNouvelles(l(1, 2, 3), new Set([1, 2]))).toEqual([3]);
    expect(clesNouvelles(l(1, 2, 3, 4, 5, 6, 7), new Set([1]))).toEqual([]);
  });

  test('DataTable : seule la ligne ajoutée est surlignée', () => {
    const colonnes = [{ id: 'nom', libelle: 'Nom' }];
    const { rerender, container } = render(<DataTable colonnes={colonnes} lignes={[{ id: 'a', nom: 'Article A' }]} exportable={false} />);
    expect(container.querySelectorAll('tr.ems-ligne-nouvelle')).toHaveLength(0);
    rerender(<DataTable colonnes={colonnes} lignes={[{ id: 'a', nom: 'Article A' }, { id: 'b', nom: 'Article B' }]} exportable={false} />);
    const surlignees = [...container.querySelectorAll('tr.ems-ligne-nouvelle')].map((tr) => tr.textContent);
    expect(surlignees).toEqual(['Article B']);
  });

  test('niveau réduit : aucun surlignage', () => {
    document.documentElement.dataset.animations = 'reduit';
    const colonnes = [{ id: 'nom', libelle: 'Nom' }];
    const { rerender, container } = render(<DataTable colonnes={colonnes} lignes={[{ id: 'a', nom: 'A' }]} exportable={false} />);
    rerender(<DataTable colonnes={colonnes} lignes={[{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }]} exportable={false} />);
    expect(container.querySelectorAll('tr.ems-ligne-nouvelle')).toHaveLength(0);
  });
});

describe('composants partagés', () => {
  test('Modale : un nouvel affichage du parent ne déplace plus le focus du champ en cours ; Échap ferme', () => {
    const fermer = vi.fn();
    function Parent() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>Rafraîchir {n}</button>
          <Modale titre="Comptage" onFermer={() => fermer(n)}>
            <input aria-label="Premier" />
            <input aria-label="Second" />
          </Modale>
        </>
      );
    }
    render(<Parent />);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    screen.getByLabelText('Second').focus();
    act(() => { screen.getByText(/Rafraîchir/).click(); });
    act(() => { screen.getByText(/Rafraîchir/).click(); });
    expect(document.activeElement).toBe(screen.getByLabelText('Second'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fermer).toHaveBeenCalledWith(2);
  });

  test('Bouton : l’état « en cours » suit la requête réelle et empêche un second envoi', () => {
    const { rerender } = render(<Bouton variante="principal" chargement>Enregistrer</Bouton>);
    const bouton = screen.getByRole('button');
    expect(bouton.getAttribute('aria-busy')).toBe('true');
    expect(bouton.disabled).toBe(true);
    expect(bouton.textContent).toBe('Patientez…');
    rerender(<Bouton variante="principal">Enregistrer</Bouton>);
    expect(bouton.hasAttribute('aria-busy')).toBe(false);
    expect(bouton.disabled).toBe(false);
  });
});
