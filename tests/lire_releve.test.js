import { describe, expect, test } from 'vitest';
import { lireDate, lireMontant, lireReleve } from '../src/modules/paiements/lireReleve.js';

describe('lecture d’un relevé', () => {
  test('montants écrits de plusieurs façons', () => {
    expect(lireMontant('1 234,50')).toBe(1234.5);
    expect(lireMontant('1,234.50')).toBe(1234.5);
    expect(lireMontant('-2500')).toBe(-2500);
    expect(lireMontant('(2 500)')).toBe(-2500);
    expect(lireMontant('150.000')).toBe(150000);
    expect(lireMontant('')).toBeNull();
    expect(lireMontant('abc')).toBeNull();
  });

  test('dates ISO, jour/mois/année ou mois/jour/année ; date impossible refusée', () => {
    expect(lireDate('2026-10-02')).toBe('2026-10-02');
    expect(lireDate('02/10/2026')).toBe('2026-10-02');
    expect(lireDate('10/02/2026', 'mja')).toBe('2026-10-02');
    expect(lireDate('31/02/2026')).toBeNull();
    expect(lireDate('hier')).toBeNull();
  });

  test('colonnes débit / crédit, séparateur détecté, lignes illisibles signalées sans bloquer les autres', () => {
    const r = lireReleve('Date,Libellé,Débit,Crédit,Référence\n02/10/2026,"Paiement client, FA-00012",,75000,MM-1\n03/10/2026,Frais,1500,,\nbientôt,Rien,,10,\n');
    expect(r.operations).toEqual([
      { jour: '2026-10-02', libelle: 'Paiement client, FA-00012', reference: 'MM-1', montant: 75000 },
      { jour: '2026-10-03', libelle: 'Frais', reference: null, montant: -1500 },
    ]);
    expect(r.erreurs).toEqual([expect.objectContaining({ ligne: 4, raison: 'date illisible' })]);
    expect(() => lireReleve('nom;prix\nx;1')).toThrow(/date/);
  });
});
