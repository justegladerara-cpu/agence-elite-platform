import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Comptabilité (M01, Bêta) : plan réglable, écritures équilibrées et définitives, génération rejouable, extourne, droits.
let db;
let sa;
let gerant;
let comptable;
let employe;
let autreGerant;
let etab;
let autreEtab;
let journalOD;
let caisse;
let capital;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const rpc = (user, fn, p) => valeur(user, `select ${fn}($1, $2::jsonb)`, [etab, json(p)]);
const depense = async (libelle, montant, mode, date) => (await db.query(
  `insert into depenses(etablissement_id, libelle, montant, mode, cree_par, date_depense) values ($1, $2, $3, $4, $5, $6) returning id`,
  [etab, libelle, montant, mode, gerant, date]
)).rows[0].id;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@co.test');
  gerant = await utilisateur('gerant@co.test');
  comptable = await utilisateur('comptable@co.test');
  employe = await utilisateur('employe@co.test');
  autreGerant = await utilisateur('autre@co.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Compta Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Compta Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'comptabilite', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'comptabilite', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'comptable'), ($1, $4, 'employe'), ($5, $6, 'gerant')`,
    [etab, gerant, comptable, employe, autreEtab, autreGerant]
  );
});

afterAll(async () => db.close());

describe('comptabilité', () => {
  test('préparer le plan : modèle simple, rejouable, réservé', async () => {
    await expect(valeur(employe, 'select initialiser_comptabilite($1)', [etab])).rejects.toThrow(/Permission refusée/);
    const r = await valeur(comptable, 'select initialiser_comptabilite($1)', [etab]);
    expect(r).toEqual({ comptes: 12, journaux: 3 });
    expect(await valeur(comptable, 'select initialiser_comptabilite($1)', [etab])).toEqual({ comptes: 0, journaux: 0 });
    expect(Number((await db.query('select count(*) from compta_affectations where etablissement_id = $1', [etab])).rows[0].count)).toBe(13);
    journalOD = (await db.query("select id from compta_journaux where etablissement_id = $1 and code = 'OD'", [etab])).rows[0].id;
    caisse = (await db.query("select id from compta_comptes where etablissement_id = $1 and numero = '5300'", [etab])).rows[0].id;
    capital = (await db.query("select id from compta_comptes where etablissement_id = $1 and numero = '1000'", [etab])).rows[0].id;
  });

  test('plan réglable : renuméroter, ajouter, pas de doublon, compte affecté non désactivable', async () => {
    await rpc(comptable, 'enregistrer_compte_comptable', { id: caisse, numero: '571', libelle: 'Caisse principale', nature: 'actif' });
    expect((await db.query('select numero from compta_comptes where id = $1', [caisse])).rows[0].numero).toBe('571');
    await expect(rpc(comptable, 'enregistrer_compte_comptable', { numero: '571', libelle: 'Double', nature: 'actif' })).rejects.toThrow(/existe déjà/);
    await expect(rpc(comptable, 'enregistrer_compte_comptable', { numero: 'a b', libelle: 'X', nature: 'actif' })).rejects.toThrow(/invalide/);
    await expect(rpc(comptable, 'enregistrer_compte_comptable', { id: caisse, numero: '571', libelle: 'Caisse', nature: 'actif', actif: false })).rejects.toThrow(/automatiques/);
    const autreCompte = await valeur(autreGerant, "select enregistrer_compte_comptable($1, $2::jsonb)", [autreEtab, json({ numero: '9', libelle: 'Ailleurs', nature: 'actif' })]);
    await expect(valeur(comptable, "select definir_affectation_comptable($1, 'charges', $2)", [etab, autreCompte])).rejects.toThrow(/introuvable/);
    await expect(valeur(comptable, "select definir_affectation_comptable($1, 'inconnue', $2)", [etab, caisse])).rejects.toThrow(/inconnue/);
  });

  test('saisie manuelle : équilibre obligatoire, numérotation, écriture définitive', async () => {
    const base = { journal_id: journalOD, date: '2026-10-01', libelle: 'Apport en caisse' };
    await expect(rpc(comptable, 'enregistrer_ecriture', { ...base, lignes: [{ compte_id: caisse, debit: 100 }, { compte_id: capital, credit: 90 }] })).rejects.toThrow(/déséquilibrée/);
    await expect(rpc(comptable, 'enregistrer_ecriture', { ...base, lignes: [{ compte_id: caisse, debit: 100, credit: 100 }, { compte_id: capital, credit: 0 }] })).rejects.toThrow(/soit un débit/);
    await expect(rpc(comptable, 'enregistrer_ecriture', { ...base, lignes: [{ compte_id: caisse, debit: 100 }] })).rejects.toThrow(/deux lignes/);
    await expect(rpc(employe, 'enregistrer_ecriture', { ...base, lignes: [] })).rejects.toThrow(/Permission refusée/);
    const id = await rpc(comptable, 'enregistrer_ecriture', { ...base, lignes: [{ compte_id: caisse, debit: 100000 }, { compte_id: capital, credit: 100000 }] });
    expect((await db.query('select numero, total from compta_ecritures where id = $1', [id])).rows[0]).toEqual({ numero: 'EC-00001', total: '100000.00' });
    await expect(db.query("update compta_ecritures set libelle = 'x' where id = $1", [id])).rejects.toThrow();
    await expect(db.query('delete from compta_lignes where ecriture_id = $1', [id])).rejects.toThrow();
  });

  test('génération depuis les dépenses : rejouable, annulation contre-passée, date de début respectée', async () => {
    await depense('Ancienne', 999, 'especes', '2020-01-15');
    const d1 = await depense('Loyer', 50000, 'virement', '2026-10-02');
    await depense('Taxi', 3000, 'especes', '2026-10-03');
    await db.query("insert into etablissement_parametres(etablissement_id, module_id, data) values ($1, 'comptabilite', '{\"debut_comptabilite\": \"2026-01-01\"}')", [etab]);
    expect(await valeur(comptable, "select count(*)::int from compta_operations_en_attente($1, '2026-10-31')", [etab])).toBe(2);
    expect(await valeur(comptable, "select compta_apercu_attente($1, '2026-10-31')", [etab])).toMatchObject({ nombre: 2, montant: 53000 });
    expect(await valeur(comptable, "select generer_ecritures($1, '2026-10-31')", [etab])).toEqual({ ecritures: 2 });
    expect(await valeur(comptable, "select generer_ecritures($1, '2026-10-31')", [etab])).toEqual({ ecritures: 0 });
    await db.query("update depenses set statut = 'annulee', annulee_le = '2026-10-04 10:00+00', annulee_par = $2, motif_annulation = 'Erreur' where id = $1", [d1, gerant]);
    expect(await valeur(comptable, "select generer_ecritures($1, '2026-10-31')", [etab])).toEqual({ ecritures: 1 });
    const balance = await valeur(comptable, "select compta_balance($1, '2026-10-01', '2026-10-31')", [etab]);
    const ligne = (n) => balance.find((b) => b.numero === n);
    expect(ligne('6200')).toMatchObject({ numero: '6200', debit: 53000, credit: 50000, solde: 3000 });
    expect(ligne('571').solde).toBe(97000);
    expect(ligne('5100').solde).toBe(0);
  });

  test('extourne : une seule fois, jamais sur une extourne', async () => {
    const id = (await db.query("select id from compta_ecritures where etablissement_id = $1 and source_type = 'manuelle'", [etab])).rows[0].id;
    const ext = await valeur(comptable, "select extourner_ecriture($1, 'Saisie en double', '2026-10-05')", [id]);
    await expect(valeur(comptable, "select extourner_ecriture($1, 'Encore')", [id])).rejects.toThrow(/déjà extournée/);
    await expect(valeur(comptable, "select extourner_ecriture($1, 'Non')", [ext])).rejects.toThrow(/ne s'extourne pas/);
    await expect(valeur(comptable, "select extourner_ecriture($1, '')", [id])).rejects.toThrow(/motif/);
    const balance = await valeur(comptable, "select compta_balance($1, '2026-10-01', '2026-10-31')", [etab]);
    expect(balance.find((b) => b.numero === '1000').solde).toBe(0);
  });

  test('isolation : autre établissement, employé sans droit, accès direct refusé', async () => {
    expect(await comme(autreGerant, 'select id from compta_ecritures where etablissement_id = $1', [etab])).toEqual([]);
    expect(await comme(employe, 'select id from compta_lignes where etablissement_id = $1', [etab])).toEqual([]);
    expect(await valeur(autreGerant, "select compta_balance($1, '2026-01-01', '2026-12-31')", [etab])).toEqual([]);
    await expect(valeur(autreGerant, "select generer_ecritures($1)", [etab])).rejects.toThrow(/Permission refusée/);
    await expect(valeur(employe, "select count(*) from compta_operations_en_attente($1)", [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "insert into compta_comptes(etablissement_id, numero, libelle, nature) values ($1, 'X', 'X', 'actif')", [etab])).rejects.toThrow();
    await expect(comme(gerant, 'select compta_ecrire($1, $2, current_date, $3, $4, null, $5::jsonb)', [etab, journalOD, 'x', 'manuelle', '[]'])).rejects.toThrow(/permission denied/);
    const k = await valeur(gerant, "select cockpit_comptabilite($1, '2026-10-01', '2026-10-31')", [etab]);
    expect(k.kpis.find((x) => x.cle === 'charges').valeur).toBe(3000);
    expect(k.attention.find((x) => x.cle === 'plan')).toBeUndefined();
  });
});
