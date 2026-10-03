import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db, admin, gerant, autre, etab, autreEtab, hub, table;
const comme = (u, sql, p = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, p)).rows);
const valeur = async (u, sql, p = []) => Object.values((await comme(u, sql, p))[0])[0];
const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;

beforeAll(async () => {
  db = await creerBase(); admin = await utilisateur('admin@rest-res.test'); gerant = await utilisateur('gerant@rest-res.test'); autre = await utilisateur('autre@rest-res.test');
  await db.query("insert into plateforme_admins(user_id,role) values($1,'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Restaurant réservations')");
  etab = await valeur(admin, "select creer_etablissement($1,'restaurant','Le Patio')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1,'restaurant','Autre')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values($1,$2,'gerant'),($3,$4,'gerant')", [etab, gerant, autreEtab, autre]);
  hub = (await db.query('select id from hubs where etablissement_id=$1 and principal', [etab])).rows[0].id;
  table = await valeur(gerant, 'select enregistrer_table_restaurant($1,$2::jsonb)', [etab, JSON.stringify({ hub_id: hub, nom: 'T1', zone: 'Terrasse', places: 4 })]);
});
afterAll(async () => db.close());

describe('réservations Restaurant', () => {
  test('création, conflit horaire et capacité sont contrôlés', async () => {
    const debut = new Date(Date.now() + 86400000).toISOString();
    const id = await valeur(gerant, 'select enregistrer_reservation_restaurant($1,$2::jsonb)', [etab, JSON.stringify({ hub_id: hub, table_id: table, nom_client: 'Awa Moukala', telephone: '06 000 00 00', debut, duree_minutes: 120, couverts: 4 })]);
    expect(id).toBeTruthy();
    await expect(comme(gerant, 'select enregistrer_reservation_restaurant($1,$2::jsonb)', [etab, JSON.stringify({ hub_id: hub, table_id: table, nom_client: 'Autre famille', debut, duree_minutes: 60, couverts: 2 })])).rejects.toThrow(/déjà réservée/);
    await expect(comme(gerant, 'select enregistrer_reservation_restaurant($1,$2::jsonb)', [etab, JSON.stringify({ hub_id: hub, table_id: table, nom_client: 'Groupe', debut: new Date(Date.now() + 172800000).toISOString(), couverts: 8 })])).rejects.toThrow(/4 places/);
  });
  test('arrivée, fin, absence motivée et isolation', async () => {
    const r = (await db.query("select id from rest_reservations where nom_client='Awa Moukala'")).rows[0].id;
    await comme(gerant, "select statut_reservation_restaurant($1,'arrivee')", [r]);
    await comme(gerant, "select statut_reservation_restaurant($1,'terminee')", [r]);
    expect((await db.query('select statut from rest_reservations where id=$1', [r])).rows[0].statut).toBe('terminee');
    await expect(comme(autre, "select statut_reservation_restaurant($1,'arrivee')", [r])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autre, 'select * from rest_reservations where etablissement_id=$1', [etab])).toEqual([]);
    await expect(db.query('delete from rest_reservations where id=$1', [r])).rejects.toThrow(/Suppression interdite/);
  });
});
