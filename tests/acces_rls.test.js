import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let membre;
let dirigeant;
let etablissement;
let client;

beforeAll(async () => {
  db = await creerBase();
  membre = (await db.query("insert into auth.users(email) values('membre@test.test') returning id")).rows[0].id;
  dirigeant = (await db.query("insert into auth.users(email) values('dirigeant@test.test') returning id")).rows[0].id;
  client = (await db.query("insert into clients(nom) values('Client A') returning id")).rows[0].id;
  etablissement = (await db.query("insert into etablissements(client_id, solution_id, nom) values($1, 'commerce', 'A') returning id", [client])).rows[0].id;
  await db.query("insert into etablissement_modules(etablissement_id, module_id) values($1, 'etablissement')", [etablissement]);
  await db.query("insert into etablissement_modules(etablissement_id, module_id) values($1, 'membres')", [etablissement]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values($1, $2, 'gerant')", [etablissement, membre]);
  await db.query("insert into client_membres(client_id, user_id, role) values($1, $2, 'dirigeant')", [client, dirigeant]);
  await db.query("insert into etablissement_identite(etablissement_id, nom_commercial) values($1, 'Enseigne A')", [etablissement]);
});

afterAll(async () => db.close());

describe('fonctions d’accès et politiques RLS', () => {
  test('un membre actif obtient ses permissions sur un module actif', async () => {
    await commeRole(db, 'authenticated', membre, async (tx) => {
      expect((await tx.query('select est_membre($1) as ok', [etablissement])).rows[0].ok).toBe(true);
      expect((await tx.query("select module_actif($1, 'etablissement') as ok", [etablissement])).rows[0].ok).toBe(true);
      expect((await tx.query("select a_permission($1, 'etablissement.modifier') as ok", [etablissement])).rows[0].ok).toBe(true);
      expect((await tx.query('select * from etablissement_identite')).rows).toHaveLength(1);
    });
  });

  test('un dirigeant lit mais ne modifie pas son établissement', async () => {
    await commeRole(db, 'authenticated', dirigeant, async (tx) => {
      expect((await tx.query('select est_dirigeant($1) as ok', [client])).rows[0].ok).toBe(true);
      expect((await tx.query('select * from etablissements')).rows).toHaveLength(1);
      expect((await tx.query("update etablissement_identite set nom_commercial='Interdit' where etablissement_id=$1", [etablissement])).affectedRows).toBe(0);
    });
  });

  test('les ajustements retirent et ajoutent une permission', async () => {
    await db.query("update etablissement_membres set permissions_ajustees='{\"etablissement.modifier\": false, \"tableau_de_bord.lire\": true}' where etablissement_id=$1 and user_id=$2", [etablissement, membre]);
    await commeRole(db, 'authenticated', membre, async (tx) => {
      expect((await tx.query("select a_permission($1, 'etablissement.modifier') as ok", [etablissement])).rows[0].ok).toBe(false);
      expect((await tx.query("select a_permission($1, 'tableau_de_bord.lire') as ok", [etablissement])).rows[0].ok).toBe(false);
    });
    await db.query("update etablissement_membres set permissions_ajustees='{}' where etablissement_id=$1 and user_id=$2", [etablissement, membre]);
  });

  test('une dépendance inactive bloque une activation et un établissement suspendu bloque l’écriture', async () => {
    await expect(db.query("update etablissement_modules set actif=false where etablissement_id=$1 and module_id='etablissement'", [etablissement])).rejects.toThrow(/dépend encore/);
    await db.query("update etablissements set statut='suspendu' where id=$1", [etablissement]);
    await commeRole(db, 'authenticated', membre, async (tx) => {
      expect((await tx.query('select * from etablissement_identite')).rows).toHaveLength(1);
      expect((await tx.query("update etablissement_identite set nom_commercial='Interdit' where etablissement_id=$1", [etablissement])).affectedRows).toBe(0);
    });
  });
});
