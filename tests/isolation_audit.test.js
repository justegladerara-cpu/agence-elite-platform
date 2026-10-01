import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let membreA;
let membreB;
let dirigeantA;
let support;
let clientA;
let etablissementA;
let etablissementB;

beforeAll(async () => {
  db = await creerBase();
  const creerUtilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  membreA = await creerUtilisateur('a@isolation.test');
  membreB = await creerUtilisateur('b@isolation.test');
  dirigeantA = await creerUtilisateur('dirigeant@isolation.test');
  support = await creerUtilisateur('support@isolation.test');
  clientA = (await db.query("insert into clients(nom) values('Client A') returning id")).rows[0].id;
  const clientB = (await db.query("insert into clients(nom) values('Client B') returning id")).rows[0].id;
  etablissementA = (await db.query("insert into etablissements(client_id,solution_id,nom) values($1,'commerce','A') returning id", [clientA])).rows[0].id;
  etablissementB = (await db.query("insert into etablissements(client_id,solution_id,nom) values($1,'commerce','B') returning id", [clientB])).rows[0].id;
  for (const [etablissement, membre] of [[etablissementA, membreA], [etablissementB, membreB]]) {
    await db.query("insert into etablissement_modules(etablissement_id,module_id) values($1,'etablissement')", [etablissement]);
    await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values($1,$2,'gerant')", [etablissement, membre]);
    await db.query('insert into etablissement_identite(etablissement_id,nom_commercial) values($1,$2)', [etablissement, `Enseigne ${etablissement === etablissementA ? 'A' : 'B'}`]);
  }
  await db.query("insert into client_membres(client_id,user_id,role) values($1,$2,'dirigeant')", [clientA, dirigeantA]);
  await db.query("insert into plateforme_admins(user_id,role) values($1,'support')", [support]);
});

afterAll(async () => db.close());

describe('isolation, audit et support', () => {
  test('un membre de A ne voit jamais les données de B', async () => {
    await commeRole(db, 'authenticated', membreA, async (tx) => {
      expect((await tx.query('select nom_commercial from etablissement_identite')).rows).toEqual([{ nom_commercial: 'Enseigne A' }]);
      expect((await tx.query('select id from etablissements')).rows.map(({ id }) => id)).toEqual([etablissementA]);
    });
  });

  test('anon ne voit aucune donnée, et le dirigeant reste en lecture seule', async () => {
    await commeRole(db, 'anon', null, async (tx) => {
      expect((await tx.query('select * from etablissements')).rows).toHaveLength(0);
    });
    await commeRole(db, 'authenticated', dirigeantA, async (tx) => {
      expect((await tx.query('select * from etablissement_identite')).rows).toHaveLength(1);
      expect((await tx.query("update etablissement_identite set nom_commercial='Non' where etablissement_id=$1", [etablissementA])).affectedRows).toBe(0);
    });
  });

  test('un module désactivé retire immédiatement sa permission', async () => {
    await db.query("update etablissement_modules set actif=false where etablissement_id=$1 and module_id='etablissement'", [etablissementA]);
    await commeRole(db, 'authenticated', membreA, async (tx) => {
      expect((await tx.query("select a_permission($1,'etablissement.modifier') as ok", [etablissementA])).rows[0].ok).toBe(false);
    });
    await db.query("update etablissement_modules set actif=true where etablissement_id=$1 and module_id='etablissement'", [etablissementA]);
  });

  test('les modifications sensibles alimentent le journal immuable', async () => {
    await db.query("update etablissement_identite set nom_commercial='Enseigne A auditée' where etablissement_id=$1", [etablissementA]);
    const entree = (await db.query("select * from journal_audit where table_nom='etablissement_identite' and operation='UPDATE' order by id desc limit 1")).rows[0];
    expect(entree.etablissement_id).toBe(etablissementA);
    expect(entree.avant.nom_commercial).toBe('Enseigne A');
    expect(entree.apres.nom_commercial).toBe('Enseigne A auditée');
  });

  test('une session support journalisée ouvre uniquement la lecture ciblée', async () => {
    const session = (await db.query("insert into sessions_support(admin_id,etablissement_id,motif) values($1,$2,'Diagnostic demandé') returning id", [support, etablissementB])).rows[0].id;
    await commeRole(db, 'authenticated', support, async (tx) => {
      await tx.query("select set_config('app.session_support_id',$1,true)", [session]);
      expect((await tx.query('select nom_commercial from etablissement_identite')).rows).toEqual([{ nom_commercial: 'Enseigne B' }]);
      expect((await tx.query("update etablissement_identite set nom_commercial='Non' where etablissement_id=$1", [etablissementB])).affectedRows).toBe(0);
    });
    expect((await db.query("select count(*)::int as total from journal_audit where table_nom='sessions_support'")).rows[0].total).toBeGreaterThan(0);
  });
});
