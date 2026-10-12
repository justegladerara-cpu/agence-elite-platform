import { describe, expect, it } from 'vitest';
import {
  alertesLigne, arrondiPrix, conditionnementParDefaut, conditionnementsDe, coutUnitaire, derniereLivraison, prixRetenu,
} from '../src/modules/stock/reception.js';

const F1 = 'f1';
const F2 = 'f2';
const article = { id: 'a', cout_achat: 500, unites_par_lot: 24, nom_lot: 'casier' };
const memoire = [
  { article_id: 'a', fournisseur_id: F2, nom: 'carton', unites: 12, dernier_prix: 7000, derniere_quantite: 3, utilise_le: '2026-10-10T10:00:00Z' },
  { article_id: 'a', fournisseur_id: F1, nom: 'casier', unites: 24, dernier_prix: 12000, derniere_quantite: 5, utilise_le: '2026-10-11T09:00:00Z' },
  { article_id: 'b', fournisseur_id: F1, nom: 'pack', unites: 6, dernier_prix: 3000, derniere_quantite: 2, utilise_le: '2026-10-11T08:00:00Z' },
  { article_id: 'c', fournisseur_id: F1, nom: 'pack', unites: 6, dernier_prix: 3000, derniere_quantite: 2, utilise_le: '2026-10-01T08:00:00Z' },
];

describe('réception intelligente (logique écran)', () => {
  it('arrondit le prix conseillé comme la base', () => {
    expect(arrondiPrix(612)).toBe(615);
    expect(arrondiPrix(1001)).toBe(1025);
    expect(arrondiPrix(10001)).toBe(10050);
    expect(arrondiPrix(1000)).toBe(1000);
    expect(arrondiPrix(null)).toBeNull();
  });

  it('propose d’abord les conditionnements du fournisseur choisi, sans doublon', () => {
    const liste = conditionnementsDe(article, memoire, F1);
    expect(liste.map((c) => c.par)).toEqual([24, 12]);
    expect(liste[0].prixFiable).toBe(true);
    expect(liste[1].prixFiable).toBe(false);
    expect(conditionnementParDefaut(article, memoire, F1).par).toBe(24);
    expect(conditionnementParDefaut({ id: 'z' }, memoire, F1)).toBeNull();
  });

  it('retient le dernier prix du même fournisseur, sinon le coût d’achat', () => {
    expect(prixRetenu(article, { par: 24 }, memoire, F1)).toBe(12000);
    // Le prix d'un autre fournisseur n'est pas repris : coût d'achat × 12.
    expect(prixRetenu(article, { par: 12 }, memoire, F1)).toBe(6000);
    expect(prixRetenu(article, null, memoire, F1)).toBe(500);
    expect(prixRetenu({ id: 'z' }, null, [], F1)).toBeNull();
    expect(coutUnitaire(12000, 24)).toBe(500);
    expect(coutUnitaire(-1, 2)).toBeNull();
  });

  it('prévient d’une hausse, d’une vente à perte et d’une marge faible', () => {
    const hausse = alertesLigne({ cout: 550, ancienCout: 500, prixVente: 1000 });
    expect(hausse[0]).toMatchObject({ type: 'hausse', pourcentage: 10, prixConseille: 1100 });
    expect(alertesLigne({ cout: 450, ancienCout: 500, prixVente: 1000 })[0].type).toBe('baisse');
    expect(alertesLigne({ cout: 1000, ancienCout: 1000, prixVente: 900 })).toEqual([{ type: 'vente_a_perte', prixConseille: 1250 }]);
    expect(alertesLigne({ cout: 950, ancienCout: 950, prixVente: 1000 })[0]).toMatchObject({ type: 'marge_faible', marge: 5 });
    expect(alertesLigne({ cout: 500, ancienCout: 500, prixVente: 1000 })).toEqual([]);
  });

  it('refait la dernière livraison d’un fournisseur', () => {
    const lignes = derniereLivraison(memoire, F1);
    expect(lignes.map((l) => l.article_id).sort()).toEqual(['a', 'b']);
    expect(lignes.find((l) => l.article_id === 'a')).toMatchObject({ par: 24, quantite: 5 });
    expect(derniereLivraison(memoire, null)).toEqual([]);
  });
});
