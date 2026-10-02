import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Tarifs configurables et support séparé.
let db;
let admin;
let etab;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];

beforeAll(async () => {
  db = await creerBase();
  admin = (await db.query("insert into auth.users(email) values('admin@tarifs.test') returning id")).rows[0].id;
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Tarifs SARL')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique')", [client]);
});

afterAll(async () => db.close());

describe('tarifs et support', () => {
  test('les offres Commerce démarrent avec les tarifs Agence Elite', async () => {
    const offres = (await db.query("select id, prix_acquisition::float a, prix_mise_en_service::float m, prix_mensuel::float me, prix_annuel::float an, prix_support_mensuel::float s from offres where solution_id = 'commerce' order by id")).rows;
    for (const o of offres) expect(o).toMatchObject({ a: 450000, m: 50000, me: 25000, an: 150000, s: 0 });
  });

  test("les prix se modifient depuis l'espace Agence Elite", async () => {
    const offre = (await db.query("select * from offres where id = 'commerce-caisse'")).rows[0];
    await comme(admin, 'select enregistrer_offre($1::jsonb)', [JSON.stringify({ ...offre, prix_mensuel: 20000, prix_support_mensuel: 10000 })]);
    const apres = (await db.query("select prix_mensuel::float m, prix_support_mensuel::float s, prix_mise_en_service::float ms from offres where id = 'commerce-caisse'")).rows[0];
    expect(apres).toEqual({ m: 20000, s: 10000, ms: 50000 });
  });

  test("le support n'est pas inclus par défaut et s'ajoute avec une trace", async () => {
    const licence = await valeur(admin, "select attribuer_licence($1, 'commerce-caisse', 'mensuel', current_date, null, 75000)", [etab]);
    expect((await db.query('select support from licences where id = $1', [licence])).rows[0].support).toBe(false);
    const quelquun = (await db.query("insert into auth.users(email) values('x@tarifs.test') returning id")).rows[0].id;
    await expect(comme(quelquun, 'select definir_support_licence($1, true)', [licence])).rejects.toThrow(/super administrateurs/);
    await expect(comme(admin, "select definir_support_licence($1, true, 'NaN')", [licence])).rejects.toThrow(/Montant/);
    await comme(admin, "select definir_support_licence($1, true, 10000, 'MM-SUP')", [licence]);
    await comme(admin, 'select definir_support_licence($1, true)', [licence]);
    await comme(admin, 'select definir_support_licence($1, false)', [licence]);
    const evenements = (await db.query("select montant::float m, motif from licence_evenements where licence_id = $1 and type = 'support' order by cree_le", [licence])).rows;
    expect(evenements).toEqual([{ m: 10000, motif: 'Support ajouté' }, { m: 0, motif: 'Support retiré' }]);
    expect((await valeur(admin, 'select editeur_etablissement($1)', [etab])).licence.support).toBe(false);
  });
});
