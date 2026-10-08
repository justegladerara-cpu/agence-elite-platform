import { afterAll, beforeAll, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { commeRole, creerBase } from './helpers/db.js';
let db, admin, gerant, responsable, employe, etab, autre;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, (tx) => tx.query(sql, params));
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params)).rows[0])[0];
beforeAll(async () => {
  db = await creerBase();
  const user = async (nom) => (await db.query('insert into auth.users(email) values($1) returning id', [`${nom}@exemple.test`])).rows[0].id;
  admin = await user('audit-admin'); gerant = await user('audit-gerant'); responsable = await user('audit-responsable'); employe = await user('audit-employe');
  await db.query("insert into plateforme_admins(user_id,role) values($1,'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Audit fictif')");
  etab = await valeur(admin, "select creer_etablissement($1,'commerce','Établissement fictif A')", [client]);
  autre = await valeur(admin, "select creer_etablissement($1,'commerce','Établissement fictif B')", [client]);
  await db.query(`insert into etablissement_membres(etablissement_id,user_id,role_id,permissions_ajustees) values
    ($1,$2,'gerant','{}'),($1,$3,'responsable','{"membres.gerer":true}'),($1,$4,'employe','{}')`, [etab, gerant, responsable, employe]);
});
afterAll(async () => { await db?.close(); });

test('un responsable ne contourne pas la hiérarchie par une mise à jour directe', async () => {
  const resultat = await comme(responsable, "update etablissement_membres set role_id='gerant' where etablissement_id=$1 and user_id=$2", [etab, employe]);
  expect(resultat.affectedRows).toBe(0);
  expect((await db.query('select role_id from etablissement_membres where etablissement_id=$1 and user_id=$2', [etab, employe])).rows[0].role_id).toBe('employe');
  await expect(comme(responsable, "select modifier_membre($1,$2,'gerant','{}'::jsonb,true)", [etab, employe])).rejects.toThrow(/rôle|Agence Elite|Permission/);
});

test('la modification autorisée par RPC continue de fonctionner et reste auditée', async () => {
  await comme(gerant, "select modifier_membre($1,$2,'responsable','{}'::jsonb,true)", [etab, employe]);
  expect((await db.query('select role_id from etablissement_membres where etablissement_id=$1 and user_id=$2', [etab, employe])).rows[0].role_id).toBe('responsable');
  expect((await db.query("select count(*)::int n from journal_audit where table_nom='etablissement_membres' and acteur=$1 and operation='UPDATE'", [gerant])).rows[0].n).toBeGreaterThan(0);
});

test('un helper interne ne révèle plus le Hub d’un autre établissement au rôle API', async () => {
  await expect(comme(responsable, 'select hub_principal($1)', [autre])).rejects.toThrow(/permission denied/);
  expect((await db.query('select hub_principal($1) id', [autre])).rows[0].id).toBeTruthy();
});

test('même le propriétaire SQL ne déplace pas une récompense ou réservation entre établissements', async () => {
  const id = (await db.query("insert into fidelite_recompenses(etablissement_id,nom,points) values($1,'Récompense fictive',10) returning id", [etab])).rows[0].id;
  await expect(db.query('update fidelite_recompenses set etablissement_id=$1 where id=$2', [autre, id])).rejects.toThrow(/établissement/);
  const hub = (await db.query('select hub_principal($1) id', [etab])).rows[0].id;
  const reservation = (await db.query(`insert into rest_reservations(etablissement_id,hub_id,nom_client,debut,couverts,cree_par)
    values($1,$2,'Réservation fictive',now()+interval '1 day',2,$3) returning id`, [etab, hub, gerant])).rows[0].id;
  await expect(db.query('update rest_reservations set etablissement_id=$1 where id=$2', [autre, reservation])).rejects.toThrow(/établissement/);
});

test('les deux migrations correctrices sont rejouables sans changer les données', async () => {
  const avant = (await db.query('select count(*)::int n from etablissement_membres')).rows[0].n;
  for (const fichier of ['20261012000001_fermer_ecritures_directes.sql', '20261012000002_indexer_cles_etrangeres.sql']) {
    await db.exec(await readFile(`supabase/migrations/${fichier}`, 'utf8'));
  }
  expect((await db.query('select count(*)::int n from etablissement_membres')).rows[0].n).toBe(avant);
});
