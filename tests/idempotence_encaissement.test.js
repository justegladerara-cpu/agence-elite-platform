import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// SUPERADMIN 2.0 (CRM) : un même encaissement envoyé deux fois ne prolonge la licence qu'une fois ; motifs gardés.
let db;
let admin;
let client;
let etab;
let licence;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const echeance = async () => (await db.query('select echeance::text e from licences where id = $1', [licence])).rows[0].e;

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@idempotence.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  client = await valeur(admin, "select creer_client('Client Fictif Idempotence', 'Congo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Magasin Fictif')", [client]);
  await comme(admin, "select attribuer_licence($1, 'commerce-caisse', 'mensuel', current_date, null, 15000, '{}', 'REF-FICTIVE', 'Premier mois')", [etab]);
  licence = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [etab])).rows[0].id;
});

afterAll(async () => db.close());

describe('idempotence des encaissements', () => {
  test('même référence OP-… : une seule prolongation, la même échéance renvoyée', async () => {
    const avant = await echeance();
    const r1 = await valeur(admin, "select renouveler_licence($1, null, 15000, 'OP-essai-1', 'Paiement fictif')", [licence]);
    const apres = await echeance();
    expect(apres > avant).toBe(true);
    const r2 = await valeur(admin, "select renouveler_licence($1, null, 15000, 'OP-essai-1', 'Paiement fictif')", [licence]);
    expect(String(r2)).toBe(String(r1));
    expect(await echeance()).toBe(apres);
    const n = (await db.query("select count(*)::int n from licence_evenements where reference = 'OP-essai-1'")).rows[0].n;
    expect(n).toBe(1);
  });

  test('une référence d’opération ne peut pas servir à une autre licence', async () => {
    const etab2 = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Magasin Fictif 2')", [client]);
    await comme(admin, "select attribuer_licence($1, 'commerce-caisse', 'mensuel', current_date, null, 15000, '{}', 'REF-2', 'Premier mois')", [etab2]);
    const autre = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [etab2])).rows[0].id;
    await expect(comme(admin, "select renouveler_licence($1, null, 15000, 'OP-essai-1', null)", [autre])).rejects.toThrow(/autre licence/);
  });

  test('les références ordinaires gardent le comportement d’avant (deux renouvellements possibles)', async () => {
    const a = await echeance();
    await valeur(admin, "select renouveler_licence($1, null, 0, 'Prolongation CRM', 'Sans paiement : fictif')", [licence]);
    await valeur(admin, "select renouveler_licence($1, null, 0, 'Prolongation CRM', 'Sans paiement : fictif')", [licence]);
    expect(await echeance() > a).toBe(true);
  });

  test('l’index refuse un doublon écrit directement', async () => {
    await expect(db.query("insert into licence_evenements(licence_id, etablissement_id, type, nouvelle_echeance, montant, reference) values ($1, $2, 'renouvellement', current_date + 400, 0, 'OP-essai-1')", [licence, etab])).rejects.toThrow(/unique|duplicate/i);
  });
});

describe('motifs des gestes', () => {
  test('bloquer un client garde le motif ; l’appel sans motif marche toujours', async () => {
    await comme(admin, "select definir_statut_client($1, 'suspendu', 'Impayé fictif')", [client]);
    await comme(admin, "select definir_statut_client(p_client_id => $1, p_statut => 'actif')", [client]);
    const lignes = (await db.query("select apres from journal_audit where table_nom = 'clients' and ligne_id = $1 and apres ? 'motif' order by id", [client])).rows;
    expect(lignes.slice(-2).map((l) => l.apres)).toEqual([{ statut: 'suspendu', motif: 'Impayé fictif' }, { statut: 'actif', motif: null }]);
  });

  test('établissement et module : motif gardé', async () => {
    await comme(admin, "select definir_statut_etablissement($1, 'suspendu', 'Contrôle fictif')", [etab]);
    await comme(admin, "select definir_statut_etablissement($1, 'actif')", [etab]);
    await comme(admin, "select definir_module_etablissement($1, 'caisse', true, 'Réactivation fictive')", [etab]);
    const e = (await db.query("select apres from journal_audit where table_nom = 'etablissements' and ligne_id = $1 and apres ? 'motif' order by id", [etab])).rows;
    expect(e.at(-2).apres).toEqual({ statut: 'suspendu', motif: 'Contrôle fictif' });
    const m = (await db.query("select apres from journal_audit where table_nom = 'etablissement_modules' and etablissement_id = $1 and apres ? 'motif' order by id desc limit 1", [etab])).rows[0];
    expect(m.apres).toEqual({ module: 'caisse', actif: true, motif: 'Réactivation fictive' });
  });

  test('un compte sans rôle éditeur est refusé', async () => {
    const intrus = await utilisateur('intrus@idempotence.test');
    await expect(comme(intrus, "select definir_statut_client($1, 'suspendu', 'x')", [client])).rejects.toThrow();
    await expect(comme(intrus, "select renouveler_licence($1, null, 0, 'OP-intrus', null)", [licence])).rejects.toThrow();
  });
});
