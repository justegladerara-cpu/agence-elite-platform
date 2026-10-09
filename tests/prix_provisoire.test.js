import { describe, expect, test } from 'vitest';
import { proposerPrixProvisoire } from '../src/modules/articles/prixProvisoire.js';

describe('prix provisoires The Dream', () => {
  test('moyenne arrondie à 500 FCFA', () => {
    expect(proposerPrixProvisoire(30000, 20000)).toMatchObject({ prix: 25000, statut: 'provisoire', methode: 'moyenne_arrondie' });
    expect(proposerPrixProvisoire(8000, 4500).prix).toBe(6500);
  });
  test('conserve les tarifs concordants', () => {
    expect(proposerPrixProvisoire(5000, 5000)).toMatchObject({ prix: 5000, statut: 'confirme_par_concordance' });
  });
  test('ne crée pas de prix sans base fiable', () => {
    expect(proposerPrixProvisoire(null, '')).toMatchObject({ prix: null, statut: 'a_confirmer' });
  });
  test('conserve la source unique et la signale comme provisoire', () => {
    expect(proposerPrixProvisoire(2500, null)).toMatchObject({ prix: 2500, statut: 'provisoire' });
    expect(proposerPrixProvisoire(null, 3500)).toMatchObject({ prix: 3500, statut: 'provisoire' });
  });
});
