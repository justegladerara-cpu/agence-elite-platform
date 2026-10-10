import { describe, expect, test } from 'vitest';
import { balanceAgee, joursDeRetard, messageRelance, trancheRetard } from '../src/modules/facturation/commun.js';
import { lignesExportComptable } from '../src/modules/comptabilite/Comptabilite.jsx';

const ventes = {
  v1: { total: 100000, montant_paye: 40000, statut: 'validee' },
  v2: { total: 50000, montant_paye: 0, statut: 'validee' },
  v3: { total: 30000, montant_paye: 30000, statut: 'validee' },
  v4: { total: 20000, montant_paye: 0, statut: 'annulee' },
  v5: { total: 10000, montant_paye: 0, statut: 'validee' },
};
const doc = (id, contact, vente, echeance, extra = {}) => ({ id, numero: `F-${id}`, type: 'facture', statut: 'emise', contact_id: contact, vente_id: vente, echeance, date_document: '2026-06-01', ...extra });

describe('balance âgée', () => {
  test('jours et tranches', () => {
    expect(joursDeRetard('2026-10-01', '2026-10-09')).toBe(8);
    expect(joursDeRetard('2026-10-20', '2026-10-09')).toBe(-11);
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(trancheRetard)).toEqual(['a_echoir', 'j30', 'j30', 'j60', 'j60', 'j90', 'j90', 'plus90']);
  });

  test('seules les factures émises non soldées comptent, regroupées par client, le plus en retard d\'abord', () => {
    const lignes = balanceAgee([
      doc('1', 'a', 'v1', '2026-09-01'), // 38 j, reste 60 000
      doc('2', 'a', 'v2', '2026-10-30'), // à échoir
      doc('3', 'b', 'v3', '2026-01-01'), // payée
      doc('4', 'b', 'v4', '2026-01-01'), // vente annulée
      doc('5', 'c', 'v5', null), // sans échéance : date de la facture (130 j)
      doc('6', 'c', 'v5', '2026-01-01', { statut: 'annule' }),
      { ...doc('7', 'c', 'v2', '2026-01-01'), type: 'devis' },
    ], ventes, '2026-10-09');
    expect(lignes.map((l) => l.contact_id)).toEqual(['c', 'a']);
    expect(lignes[1]).toMatchObject({ total: 110000, retard_max: 38, tranches: { a_echoir: 50000, j30: 0, j60: 60000, j90: 0, plus90: 0 } });
    expect(lignes[0]).toMatchObject({ total: 10000, tranches: { plus90: 10000 } });
  });

  test('message de relance : ton selon le retard, total, signature', () => {
    const montant = (n) => `${n} F`;
    const doux = messageRelance({ nom: 'Mme Test', factures: [{ numero: 'F-1', reste: 5000, jours: 0 }], montant, emetteur: 'Boutique Démo' });
    expect(doux).toMatch(/arrivent à échéance/);
    expect(doux).toMatch(/Total : 5000 F\./);
    expect(doux).toMatch(/Cordialement, Boutique Démo$/);
    const ferme = messageRelance({ nom: 'M. Test', factures: [{ numero: 'F-2', reste: 1000, jours: 75 }, { numero: 'F-3', reste: 2000, jours: 10 }], montant });
    expect(ferme).toMatch(/malgré nos précédents rappels/);
    expect(ferme).toMatch(/- F-2 : 1000 F \(en retard de 75 j\)/);
    expect(ferme).toMatch(/Total : 3000 F\./);
  });
});

describe('trésorerie (lot E)', () => {
  test('une facture contestée reste due mais est signalée, pour être exclue des relances', () => {
    const documents = [
      { id: 'f1', type: 'facture', statut: 'emise', contact_id: 'c', vente_id: 'v1', numero: 'FA-1', date_document: '2026-01-01', echeance: '2026-01-31' },
      { id: 'f2', type: 'facture', statut: 'emise', contact_id: 'c', vente_id: 'v2', numero: 'FA-2', date_document: '2026-01-01', echeance: '2026-01-31' },
    ];
    const ventes = { v1: { statut: 'validee', total: 100, montant_paye: 0 }, v2: { statut: 'validee', total: 50, montant_paye: 0 } };
    const [ligne] = balanceAgee(documents, ventes, '2026-02-10', new Set(['f2']));
    expect(ligne.total).toBe(150);
    expect(ligne.factures.map((f) => [f.numero, f.contestee])).toEqual([['FA-1', false], ['FA-2', true]]);
  });

  test('export comptable : une ligne par mouvement, triée par date puis pièce', () => {
    const r = lignesExportComptable({
      ecritures: [{ id: 'e2', journal_id: 'j', numero: 'VT-10', date_ecriture: '2026-01-02', libelle: 'Vente' }, { id: 'e1', journal_id: 'j', numero: 'VT-9', date_ecriture: '2026-01-02', libelle: 'Vente' }],
      lignes: [
        { ecriture_id: 'e2', compte_id: 'k1', debit: 0, credit: 100, libelle: null },
        { ecriture_id: 'e1', compte_id: 'k2', debit: 50.5, credit: 0, libelle: 'Encaissement' },
        { ecriture_id: 'autre', compte_id: 'k2', debit: 1, credit: 0 },
      ],
      comptes: [{ id: 'k1', numero: '701', libelle: 'Ventes' }, { id: 'k2', numero: '571', libelle: 'Caisse' }],
      journaux: [{ id: 'j', code: 'VT' }],
    });
    expect(r).toEqual([
      { journal: 'VT', date: '2026-01-02', piece: 'VT-9', compte: '571', libelle_compte: 'Caisse', libelle: 'Encaissement', debit: 50.5, credit: 0 },
      { journal: 'VT', date: '2026-01-02', piece: 'VT-10', compte: '701', libelle_compte: 'Ventes', libelle: 'Vente', debit: 0, credit: 100 },
    ]);
  });
});
