import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let admin;
let sansCourriel;
let gerant;
let employe;
let client;
let etab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@correctifs.test');
  sansCourriel = await utilisateur(null);
  gerant = await utilisateur('gerant@correctifs.test');
  employe = await utilisateur('employe@correctifs.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  client = (await db.query("insert into clients(nom) values('Client') returning id")).rows[0].id;
  etab = (await db.query("insert into etablissements(client_id, solution_id, nom) values($1, 'commerce', 'E') returning id", [client])).rows[0].id;
  for (const module of ['etablissement', 'membres', 'tableau_de_bord']) {
    await db.query('insert into etablissement_modules(etablissement_id, module_id) values($1, $2)', [etab, module]);
  }
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, employe]);
  await db.query("insert into etablissement_identite(etablissement_id, nom_commercial) values($1, 'Enseigne')", [etab]);
});

afterAll(async () => db.close());

describe('correctifs de sécurité du Lot 1', () => {
  test('un compte sans courriel ne peut pas voler une invitation', async () => {
    const invitation = (await db.query("insert into invitations(email, etablissement_id, role_id, cree_par) values('cible@correctifs.test', $1, 'gerant', $2) returning id", [etab, admin])).rows[0].id;
    await expect(commeRole(db, 'authenticated', sansCourriel, (tx) => tx.query('select public.accepter_invitation($1)', [invitation]))).rejects.toThrow(/sans adresse courriel/);
    expect((await db.query('select count(*)::int n from etablissement_membres where user_id = $1', [sansCourriel])).rows[0].n).toBe(0);
  });

  test("un client suspendu bloque l'écriture de ses établissements", async () => {
    expect((await db.query('select public.etablissement_autorise_ecriture($1) v', [etab])).rows[0].v).toBe(true);
    await db.query("update clients set statut = 'suspendu' where id = $1", [client]);
    expect((await db.query('select public.etablissement_autorise_ecriture($1) v', [etab])).rows[0].v).toBe(false);
    await db.query("update clients set statut = 'actif' where id = $1", [client]);
  });

  test('un membre voit le client de son établissement', async () => {
    await commeRole(db, 'authenticated', employe, async (tx) => {
      expect((await tx.query('select id from clients')).rows.map((r) => r.id)).toEqual([client]);
    });
  });

  test("l'acteur d'un événement ne peut pas être usurpé", async () => {
    await commeRole(db, 'authenticated', employe, async (tx) => {
      await expect(tx.query("insert into evenements(etablissement_id, type, acteur) values($1, 'test', $2)", [etab, gerant])).rejects.toThrow();
    });
    await commeRole(db, 'authenticated', employe, async (tx) => {
      await tx.query("insert into evenements(etablissement_id, type, acteur) values($1, 'test', $2)", [etab, employe]);
    });
  });

  test('le super admin ne lit pas les données hors session support, puis les lit en session', async () => {
    await commeRole(db, 'authenticated', admin, async (tx) => {
      expect((await tx.query('select * from etablissement_identite')).rows).toHaveLength(0);
      const session = (await tx.query("select public.ouvrir_session_support($1, 'Diagnostic') id", [etab])).rows[0].id;
      await tx.query("select set_config('app.session_support_id', $1, true)", [session]);
      expect((await tx.query('select nom_commercial from etablissement_identite')).rows).toEqual([{ nom_commercial: 'Enseigne' }]);
      await tx.query('select public.fermer_session_support($1)', [session]);
      expect((await tx.query('select * from etablissement_identite')).rows).toHaveLength(0);
    });
    expect((await db.query("select count(*)::int n from journal_audit where table_nom = 'sessions_support'")).rows[0].n).toBeGreaterThanOrEqual(2);
  });

  test("un utilisateur sans rôle éditeur ne peut pas ouvrir de session support", async () => {
    await expect(commeRole(db, 'authenticated', gerant, (tx) => tx.query("select public.ouvrir_session_support($1, 'x')", [etab]))).rejects.toThrow(/Agence Elite/);
  });

  test("un gérant n'ajoute pas de membre sans invitation et ne modifie pas sa propre ligne", async () => {
    const intrus = await utilisateur('intrus@correctifs.test');
    await commeRole(db, 'authenticated', gerant, async (tx) => {
      await expect(tx.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values($1, $2, 'gerant')", [etab, intrus])).rejects.toThrow();
    });
    await commeRole(db, 'authenticated', gerant, async (tx) => {
      expect((await tx.query("update etablissement_membres set permissions_ajustees = '{\"membres.gerer\": false}' where user_id = $1", [gerant])).affectedRows).toBe(0);
      expect((await tx.query("update etablissement_membres set role_id = 'responsable' where user_id = $1", [employe])).affectedRows).toBe(1);
    });
    await expect(db.query('update etablissement_membres set user_id = $1 where user_id = $2', [intrus, employe])).rejects.toThrow(/compte associé/);
  });

  test('les ajustements de permissions sont toujours des booléens', async () => {
    await expect(db.query("update etablissement_membres set permissions_ajustees = '{\"membres.lire\": \"oui\"}' where user_id = $1", [employe])).rejects.toThrow();
    await db.query("update etablissement_membres set permissions_ajustees = '{\"membres.lire\": true}' where user_id = $1", [employe]);
  });

  test('anon ne peut pas appeler les fonctions privilégiées', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select public.ouvrir_session_support($1, 'x')", [etab]))).rejects.toThrow();
  });
});
