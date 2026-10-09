// @vitest-environment jsdom
import React from 'react';
import { describe, expect, test } from 'vitest';
import { actionsAccessibles, ACTIONS_RAPIDES, correspond, normaliser, score } from '../src/noyau/actionsRapides.js';
import { appliquerAffichage, enregistrerAffichage, lireAffichage } from '../src/noyau/affichage.js';
import { MANIFESTES, PAGES } from '../src/modules/index.js';
import { csvDepuisTable, valeurExport } from '../src/ui/composants.jsx';

// Confort transversal : créations rapides, recherche sans accents, préférences d'affichage, export des listes.
describe('créations rapides', () => {
  test('chaque action pointe vers un écran déclaré et une permission existante du même module', () => {
    const ids = new Set(PAGES.map((p) => p.id));
    for (const a of ACTIONS_RAPIDES) {
      expect(ids.has(a.route.split(/[/?]/)[0])).toBe(true);
      expect(a.permission.startsWith(`${a.module}.`)).toBe(true);
    }
  });

  test('filtrées par module actif et permission', () => {
    const espace = { moduleActif: (m) => ['caisse', 'contacts'].includes(m), peut: (p) => p !== 'contacts.gerer' };
    expect(actionsAccessibles(espace).map((a) => a.id)).toEqual(['vente']);
  });

  test('recherche sans accents ni majuscules, tous les mots', () => {
    expect(normaliser('  Dépense ÉTÉ ')).toBe('depense ete');
    expect(correspond('depense', 'Nouvelle dépense')).toBe(true);
    expect(correspond('nouv fact', 'Nouvelle facture')).toBe(true);
    expect(correspond('facture client', 'Nouvelle facture')).toBe(false);
    // Un écran dont le nom commence par le mot passe avant un écran qui ne le contient que dans son groupe.
    expect(score('stock', 'Stock')).toBeGreaterThan(score('stock', 'Articles'));
    expect(score('fact', 'Devis et factures')).toBe(2);
  });

  test('les écrans sont chargés à la demande (code découpé)', () => {
    const composants = MANIFESTES.flatMap((m) => m.pages.map((p) => p.composant));
    expect(composants.every((c) => c?.$$typeof === Symbol.for('react.lazy'))).toBe(true);
  });
});

describe('affichage par appareil', () => {
  test('défauts, valeurs inconnues ignorées, application sur la page', () => {
    localStorage.clear();
    expect(lireAffichage()).toEqual({ theme: 'clair', texte: 'normal', contraste: 'normal', tactile: 'non' });
    localStorage.setItem('ae-affichage', JSON.stringify({ theme: 'rose', texte: 'grand' }));
    expect(lireAffichage()).toMatchObject({ theme: 'clair', texte: 'grand' });
    localStorage.setItem('ae-affichage', '{abîmé');
    expect(lireAffichage().theme).toBe('clair');
    enregistrerAffichage({ theme: 'sombre', tactile: 'oui' });
    expect(document.documentElement.dataset).toMatchObject({ theme: 'sombre', tactile: 'oui', texte: 'normal' });
    expect(lireAffichage()).toMatchObject({ theme: 'sombre', tactile: 'oui' });
    appliquerAffichage({ theme: 'clair', texte: 'tres_grand', contraste: 'eleve', tactile: 'non' });
    expect(document.documentElement.dataset).toMatchObject({ texte: 'tres_grand', contraste: 'eleve' });
  });
});

describe('export des listes', () => {
  const colonnes = [
    { id: 'nom', libelle: 'Nom', tri: (l) => l.nom, rendu: (l) => <strong>{l.nom}</strong> },
    { id: 'montant', libelle: 'Montant', tri: (l) => l.montant, rendu: (l) => `${l.montant} XAF` },
    { id: 'etat', libelle: 'État', rendu: (l) => <span className="badge"><b>{l.etat}</b></span> },
    { id: 'actions', libelle: '', rendu: () => <button type="button">Ouvrir</button> },
    { id: 'interne', libelle: 'Interne', exporter: false },
  ];
  const lignes = [{ nom: 'Riz; 25 kg', montant: 18000, etat: 'Payée' }, { nom: 'Huile "5 L"', montant: 6000, etat: 'En retard' }];

  test('montants en nombre, texte affiché sinon, colonnes sans titre ou exclues retirées, guillemets échappés', () => {
    expect(valeurExport(colonnes[1], lignes[0])).toBe(18000);
    expect(valeurExport(colonnes[2], lignes[1])).toBe('En retard');
    expect(csvDepuisTable(colonnes, lignes).split('\n')).toEqual([
      'Nom;Montant;État',
      '"Riz; 25 kg";18000;Payée',
      '"Huile ""5 L""";6000;En retard',
    ]);
  });
});
