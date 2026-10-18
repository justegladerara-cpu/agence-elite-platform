import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Pilotage depuis le CRM (migration 20261018000141) : activité en totaux, chronologie d'un client,
// message affiché aux équipes. Réservé au super admin ; le message est visible par les membres du client seulement.
let db;
const p = {};
let client;
let autreClient;
let etab;
let autreEtab;
const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);

beforeAll(async () => {
  db = await creerBase();
  p.admin = await utilisateur('admin@pilotage.test');
  p.patron = await utilisateur('patron@pilotage.test');
  p.autre = await utilisateur('autre@pilotage.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [p.admin]);
  client = await valeur(p.admin, "select creer_client('Bar Pilotage')");
  autreClient = await valeur(p.admin, "select creer_client('Autre Pilotage')");
  etab = await valeur(p.admin, "select creer_etablissement($1, 'commerce', 'Bar Pilotage')", [client]);
  autreEtab = await valeur(p.admin, "select creer_etablissement($1, 'commerce', 'Autre Pilotage')", [autreClient]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($3, $4, 'gerant')", [etab, p.patron, autreEtab, p.autre]);
  const biere = await valeur(p.patron, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière', prix_vente: 1000 })]);
  const hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  await comme(p.patron, "select ajuster_stock_hub($1, $2, 'entree', 20, 'Réception')", [hub, biere]);
  const session = await valeur(p.patron, 'select ouvrir_caisse($1, null, 0)', [etab]);
  for (let i = 0; i < 3; i += 1) {
    await comme(p.patron, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, session, json([{ article_id: biere, quantite: 2 }]), json([{ mode: 'especes', montant: 2000 }])]);
  }
  await comme(p.admin, "select definir_statut_etablissement($1, 'suspendu')", [autreEtab]);
});

afterAll(async () => db.close());

describe('pilotage depuis le CRM', () => {
  test("l'activité donne des totaux par établissement, jamais le détail", async () => {
    const activite = await valeur(p.admin, 'select pilotage_activite()');
    const bar = activite.find((a) => a.etablissement_id === etab);
    expect(bar).toMatchObject({ client_id: client, ventes_jour: 3, montant_jour: 6000, ventes_7j: 3, montant_7j: 6000, montant_30j: 6000, caisses_ouvertes: 1 });
    expect(bar.derniere_activite).toBeTruthy();
    expect(Object.keys(bar)).not.toContain('ventes');
  });

  test("la chronologie raconte l'histoire du client et seulement la sienne", async () => {
    const chrono = await valeur(p.admin, 'select pilotage_chronologie($1)', [client]);
    const types = chrono.map((e) => e.type);
    expect(types).toContain('ventes.jour');
    const jour = chrono.find((e) => e.type === 'ventes.jour');
    expect(jour).toMatchObject({ etablissement: 'Bar Pilotage', montant: 6000, detail: '3 vente(s)' });
    expect(chrono.every((e) => e.etablissement !== 'Autre Pilotage')).toBe(true);
    const autre = await valeur(p.admin, 'select pilotage_chronologie($1)', [autreClient]);
    expect(autre.some((e) => e.type === 'etablissement.statut' && e.detail === 'actif → suspendu')).toBe(true);
  });

  test('le message du CRM apparaît chez le client, pas chez les autres, et se retire', async () => {
    await comme(p.admin, "select definir_message_client($1, 'Votre paiement est en retard', 'urgent')", [client]);
    expect(await valeur(p.patron, 'select message_plateforme($1)', [etab])).toEqual({ texte: 'Votre paiement est en retard', ton: 'urgent' });
    expect(await valeur(p.autre, 'select message_plateforme($1)', [etab])).toBeNull();
    expect(await valeur(p.autre, 'select message_plateforme($1)', [autreEtab])).toBeNull();
    expect((await valeur(p.admin, 'select pilotage_messages()')).map((m) => m.client_id)).toEqual([client]);
    await comme(p.admin, "select definir_message_client($1, '')", [client]);
    expect(await valeur(p.patron, 'select message_plateforme($1)', [etab])).toBeNull();
    const chrono = await valeur(p.admin, 'select pilotage_chronologie($1)', [client]);
    expect(chrono.map((e) => e.type)).toEqual(expect.arrayContaining(['message.pose', 'message.retire']));
  });

  test('un message expiré ne s’affiche plus', async () => {
    await comme(p.admin, "select definir_message_client($1, 'Ancien', 'info', now() - interval '1 hour')", [client]);
    expect(await valeur(p.patron, 'select message_plateforme($1)', [etab])).toBeNull();
    await comme(p.admin, "select definir_message_client($1, '')", [client]);
  });

  test('tout est refusé à un gérant et aux visiteurs anonymes', async () => {
    for (const sql of ['select pilotage_activite()', 'select pilotage_messages()']) {
      await expect(comme(p.patron, sql)).rejects.toThrow();
    }
    await expect(comme(p.patron, 'select pilotage_chronologie($1)', [client])).rejects.toThrow();
    await expect(comme(p.patron, "select definir_message_client($1, 'Pirate')", [client])).rejects.toThrow();
    await expect(comme(p.patron, "insert into messages_plateforme(client_id, texte) values ($1, 'Pirate')", [client])).rejects.toThrow();
    const droits = (await db.query(
      "select p.proname, has_function_privilege('anon', p.oid, 'execute') anon from pg_proc p where p.proname in ('pilotage_activite', 'pilotage_chronologie', 'definir_message_client', 'pilotage_messages', 'message_plateforme') order by 1"
    )).rows;
    expect(droits.every((d) => d.anon === false)).toBe(true);
    expect(droits).toHaveLength(5);
  });
});
