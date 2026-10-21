// @vitest-environment jsdom
// Elite UX 2.0 : composants du design system et affichage des tableaux de bord (affichage seulement,
// aucun calcul de KPI n'est testé ici : ils sont couverts par cockpit.test.js).
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatMontant } from '../src/noyau/format.js';

const espace = {
  api: { rpc: vi.fn() },
  etablissement: { id: 'etab-test' },
  devise: 'XAF',
  montant: (n) => formatMontant(n, 'XAF'),
  peut: () => true,
  multiHub: false,
};
vi.mock('../src/noyau/espace.jsx', () => ({ useEspace: () => espace, useDonnees: () => ({}) }));

const { Champ, GraphiqueBarres } = await import('../src/ui/composants.jsx');
const { Kpi, grouperNombres, libellePeriode, ActionsRapides } = await import('../src/modules/tableau_de_bord/cockpit.jsx');
const { actionsDomaine } = await import('../src/modules/tableau_de_bord/domaines.js');

afterEach(cleanup);

describe('Champ', () => {
  test('relie l’aide et l’erreur au contrôle, et marque le champ en erreur', () => {
    render(<Champ libelle="Prix" aide="En FCFA" erreur="Le prix est obligatoire"><input /></Champ>);
    const saisie = screen.getByLabelText(/Prix/);
    expect(saisie.getAttribute('aria-invalid')).toBe('true');
    const ids = saisie.getAttribute('aria-describedby').split(' ');
    expect(ids.map((id) => document.getElementById(id).textContent)).toEqual(['En FCFA', 'Le prix est obligatoire']);
    expect(screen.getByRole('alert').textContent).toBe('Le prix est obligatoire');
  });

  test('sans aide ni erreur, le contrôle reste intact', () => {
    render(<Champ libelle="Nom"><input aria-describedby="autre" /></Champ>);
    expect(screen.getByLabelText('Nom').getAttribute('aria-describedby')).toBe('autre');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Indicateur (KPI)', () => {
  test.each([0, 500, 25000, 1250000, 125750000, 3456789012])('affiche le montant complet %s, sans abréviation', async (v) => {
    render(<Kpi kpi={{ cle: 'ca', libelle: 'Chiffre d’affaires', valeur: v, format: 'montant' }} periode="Aujourd’hui" />);
    await waitFor(() => expect(document.querySelector('.kpi-valeur').textContent).toBe(formatMontant(v, 'XAF')));
    expect(screen.getByText('Aujourd’hui')).toBeTruthy();
  });

  test('une valeur absente se distingue d’un vrai zéro', () => {
    render(<Kpi kpi={{ cle: 'ca', libelle: 'Chiffre d’affaires', valeur: null, format: 'montant' }} />);
    expect(screen.getByText('Donnée indisponible')).toBeTruthy();
    expect(document.querySelector('.kpi-valeur').textContent).toBe('—');
  });

  test('l’évolution est dite en mots, pas seulement par la couleur', () => {
    render(<Kpi kpi={{ cle: 'ca', libelle: 'CA', valeur: 120, precedent: 100, format: 'nombre' }} />);
    const v = document.querySelector('.kpi-variation');
    expect(v.textContent).toContain('En hausse de');
    expect(v.textContent).toContain('20 %');
    expect(v.textContent).toContain('favorable');
  });

  test('le domaine et la période s’affichent sous le titre', () => {
    render(<Kpi kpi={{ cle: 'ca', libelle: 'Chiffre d’affaires', valeur: 1, format: 'nombre', domaine: 'Commerce' }} periode="7 jours" />);
    expect(screen.getByText('Chiffre d’affaires')).toBeTruthy();
    expect(screen.getByText('Commerce · 7 jours')).toBeTruthy();
  });
});

describe('Lecture des nombres et des périodes', () => {
  test('les grands nombres d’un texte sont groupés, les années ne bougent pas', () => {
    expect(grouperNombres('Écart cumulé : -317500')).toBe('Écart cumulé : -317 500');
    expect(grouperNombres('Total dû : 52000 depuis 2026')).toBe('Total dû : 52 000 depuis 2026');
    expect(grouperNombres(undefined)).toBeUndefined();
  });

  test('libellé de période', () => {
    expect(libellePeriode({ periode: '7j' })).toBe('7 jours');
    expect(libellePeriode({ periode: 'perso', du: '2026-10-01', au: '2026-10-01' })).toMatch(/2026/);
    expect(libellePeriode(null)).toBeNull();
  });
});

describe('Actions rapides', () => {
  test('« Transfert » n’est proposé qu’avec plusieurs Hubs', () => {
    const tout = () => true;
    expect(actionsDomaine('commerce', tout, true).some((a) => a.libelle === 'Transfert')).toBe(true);
    expect(actionsDomaine('commerce', tout, false).some((a) => a.libelle === 'Transfert')).toBe(false);
    render(<ActionsRapides domaines={['commerce']} naviguer={() => {}} />);
    expect(screen.queryByRole('button', { name: /Transfert/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Voir les retours/ })).toBeTruthy();
  });
});

describe('Graphique en barres', () => {
  const donnees = [{ libelle: 'Lun', valeur: 1000 }, { libelle: 'Mar', valeur: 250000 }];

  test('chaque barre est atteignable au clavier et dit sa valeur', () => {
    render(<GraphiqueBarres donnees={donnees} libelle="Ventes" format={(v) => `${v} F`} />);
    const barres = screen.getAllByRole('img');
    expect(barres.map((b) => b.getAttribute('aria-label'))).toEqual(['Lun : 1000 F', 'Mar : 250000 F']);
    fireEvent.focus(barres[1]);
    expect(document.querySelector('.graphique-valeur').textContent).toBe('250000 F');
  });

  test('au toucher, le premier appui montre la valeur, le second ouvre le détail', () => {
    const onBarre = vi.fn();
    render(<GraphiqueBarres donnees={donnees} onBarre={onBarre} format={(v) => `${v} F`} />);
    const barre = screen.getAllByRole('button')[0];
    fireEvent.pointerDown(barre, { pointerType: 'touch' });
    fireEvent.click(barre);
    expect(onBarre).not.toHaveBeenCalled();
    expect(document.querySelector('.graphique-valeur').textContent).toBe('1000 F');
    fireEvent.pointerDown(barre, { pointerType: 'touch' });
    fireEvent.click(barre);
    expect(onBarre).toHaveBeenCalledWith(donnees[0]);
  });

  test('sans valeur : message vide, pas de graphique', () => {
    render(<GraphiqueBarres donnees={[{ libelle: 'Lun', valeur: 0 }]} />);
    expect(screen.getByText('Aucune valeur sur la période')).toBeTruthy();
  });
});
