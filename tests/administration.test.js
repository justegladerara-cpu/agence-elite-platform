import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
let db;
let admin;
let invite;
let client;
let etablissement;
beforeAll(async () => {
  db = await creerBase();
  admin = (await db.query("insert into auth.users(email) values('admin@test.test') returning id")).rows[0].id;
  invite = (await db.query("insert into auth.users(email) values('gerant@test.test') returning id")).rows[0].id;
  await db.query("insert into plateforme_admins(user_id,role) values($1,'super_admin')", [admin]);
});
afterAll(async () => db.close());

describe('administration éditeur', () => {
  test('un non-admin ne peut pas créer un client', async () => {
    await commeRole(db, 'authenticated', invite, async (tx) => {
      await expect(tx.query("select creer_client('Interdit')")).rejects.toThrow(/super administrateurs/);
    });
  });
  test('un admin crée le client et l’établissement avec les modules par défaut', async () => {
    await commeRole(db, 'authenticated', admin, async (tx) => {
      client = (await tx.query("select creer_client('Client RPC') as id")).rows[0].id;
      etablissement = (await tx.query("select creer_etablissement($1,'commerce','Établissement RPC') as id", [client])).rows[0].id;
    });
    expect((await db.query('select module_id from etablissement_modules where etablissement_id=$1 order by module_id', [etablissement])).rows).toHaveLength(3);
  });
  test('le gérant invité accepte avec son propre compte', async () => {
    let invitation;
    await commeRole(db, 'authenticated', admin, async (tx) => {
      invitation = (await tx.query("select inviter_gerant($1,'GERANT@test.test') as id", [etablissement])).rows[0].id;
    });
    await commeRole(db, 'authenticated', invite, (tx) => tx.query('select accepter_invitation($1)', [invitation]));
    expect((await db.query('select role_id from etablissement_membres where etablissement_id=$1 and user_id=$2', [etablissement, invite])).rows[0].role_id).toBe('gerant');
  });
  test('l’admin suspend puis archive sans suppression physique', async () => {
    await commeRole(db, 'authenticated', admin, async (tx) => {
      await tx.query("select definir_statut_etablissement($1,'suspendu')", [etablissement]);
      await tx.query("select definir_statut_client($1,'archive')", [client]);
    });
    expect((await db.query('select statut from etablissements where id=$1', [etablissement])).rows[0].statut).toBe('suspendu');
    expect((await db.query('select statut from clients where id=$1', [client])).rows[0].statut).toBe('archive');
  });
});
