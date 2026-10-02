import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Comptes : création par Agence Elite, mot de passe temporaire, identifiant, rôle Admin.
// Le hachage est simulé dans PGlite (pgcrypto absent) ; la vraie base utilise bcrypt.
let db;
let superAdmin;
let admin;
let patron;
let user;
let etab;
let client;

const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const anon = async (sql, params = []) => commeRole(db, 'anon', null, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);
// Ce que fait Supabase Auth quand l'utilisateur change son mot de passe.
const changerMotDePasse = (u, mdp) => db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1", [u, mdp]);

beforeAll(async () => {
  db = await creerBase();
  superAdmin = (await db.query("insert into auth.users(email) values('sa@comptes.test') returning id")).rows[0].id;
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [superAdmin]);
  client = await valeur(superAdmin, "select creer_client('Commerce Démo')");
  etab = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Commerce Démo')", [client]);
});

afterAll(async () => db.close());

describe('création de comptes et mot de passe temporaire', () => {
  test('le super admin crée Admin, Patron et User avec un mot de passe temporaire', async () => {
    admin = await valeur(superAdmin, "select creer_compte('admin@identifiants.test', 'Admin', 'Admin Agence', '1234')");
    patron = await valeur(superAdmin, "select creer_compte('patrondemo@identifiants.test', 'Patrondemo', 'Patron Démo', '1234')");
    user = await valeur(superAdmin, "select creer_compte('userdemo@identifiants.test', 'Userdemo', 'User Démo', '1234')");
    await comme(superAdmin, "select definir_admin_plateforme($1, 'admin')", [admin]);
    await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, patron, user]);
    await db.query("insert into client_membres(client_id, user_id, role) values ($1, $2, 'dirigeant')", [client, patron]);
    const c = (await db.query('select identifiant, doit_changer_mot_de_passe from comptes_connexion where user_id = $1', [patron])).rows[0];
    expect(c).toEqual({ identifiant: 'Patrondemo', doit_changer_mot_de_passe: true });
    expect((await db.query('select nom_complet from profils where id = $1', [patron])).rows[0].nom_complet).toBe('Patron Démo');
  });

  test('aucune table applicative ne contient le mot de passe', async () => {
    const tables = (await db.query("select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_name ilike '%passe%' or column_name ilike '%password%')")).rows;
    expect(tables.map((t) => t.column_name).sort()).toEqual(['doit_changer_mot_de_passe', 'mot_de_passe_change_le']);
    const dump = JSON.stringify((await db.query('select * from comptes_connexion')).rows) + JSON.stringify((await db.query('select * from journal_audit')).rows);
    expect(dump).not.toContain('1234');
  });

  test('identifiant et adresse uniques ; seuls Agence Elite créent des comptes', async () => {
    await expect(comme(superAdmin, "select creer_compte('autre@identifiants.test', 'patrondemo', 'Doublon', '1234')")).rejects.toThrow(/déjà utilisé/);
    await expect(comme(superAdmin, "select creer_compte('patrondemo@identifiants.test', 'Autre', 'Doublon', '1234')")).rejects.toThrow(/existe déjà/);
    await expect(comme(superAdmin, "select creer_compte('x@identifiants.test', 'a b', 'Espace', '1234')")).rejects.toThrow(/Identifiant invalide/);
    await expect(comme(patron, "select creer_compte('y@identifiants.test', 'Pirate', 'Pirate', '1234')")).rejects.toThrow(/réservée/);
  });

  test('tant que le mot de passe n’est pas changé, le compte ne peut rien faire (base)', async () => {
    const contexte = await valeur(patron, 'select mon_contexte()');
    expect(contexte.compte.doit_changer_mot_de_passe).toBe(true);
    expect(contexte.etablissements).toEqual([]);
    expect(await valeur(patron, 'select est_membre($1)', [etab])).toBe(false);
    expect(await valeur(patron, "select a_permission($1, 'caisse.utiliser')", [etab])).toBe(false);
    expect(await valeur(patron, 'select est_dirigeant($1)', [client])).toBe(false);
    await expect(comme(patron, 'select ouvrir_caisse($1)', [etab])).rejects.toThrow(/Permission refusée/);
    expect(await comme(patron, 'select * from etablissements')).toEqual([]);
    expect(await comme(patron, 'select * from hubs')).toEqual([]);
    await expect(comme(admin, 'select editeur_vue()')).rejects.toThrow(/réservée/);
    // Il ne peut pas lever le drapeau lui-même.
    await expect(comme(patron, 'update comptes_connexion set doit_changer_mot_de_passe = false')).resolves.toEqual([]);
    expect((await db.query('select doit_changer_mot_de_passe from comptes_connexion where user_id = $1', [patron])).rows[0].doit_changer_mot_de_passe).toBe(true);
    await expect(comme(patron, "update profils set nom_complet = 'x' where id = $1", [patron])).resolves.toBeTruthy();
    expect((await db.query('select doit_changer_mot_de_passe from comptes_connexion where user_id = $1', [patron])).rows[0].doit_changer_mot_de_passe).toBe(true);
  });

  test('le nouveau mot de passe ne peut pas être 1234 (ni un mot de passe trop simple)', async () => {
    await expect(changerMotDePasse(patron, '1234')).rejects.toThrow(/trop simple/);
    await expect(changerMotDePasse(patron, '12345678')).rejects.toThrow(/trop simple/);
    expect((await db.query('select doit_changer_mot_de_passe from comptes_connexion where user_id = $1', [patron])).rows[0].doit_changer_mot_de_passe).toBe(true);
  });

  test('après le changement, l’ancien mot de passe ne fonctionne plus et le compte est actif', async () => {
    const avant = (await db.query('select encrypted_password from auth.users where id = $1', [patron])).rows[0].encrypted_password;
    await changerMotDePasse(patron, 'Kangou-Demo-2026');
    const apres = (await db.query('select encrypted_password from auth.users where id = $1', [patron])).rows[0].encrypted_password;
    expect(apres).not.toBe(avant);
    expect((await db.query("select extensions.crypt('1234', $1) = $1 ok", [apres])).rows[0].ok).toBe(false);
    const c = (await db.query('select doit_changer_mot_de_passe, mot_de_passe_change_le from comptes_connexion where user_id = $1', [patron])).rows[0];
    expect(c.doit_changer_mot_de_passe).toBe(false);
    expect(c.mot_de_passe_change_le).toBeTruthy();
    expect((await valeur(patron, 'select mon_contexte()')).etablissements).toHaveLength(1);
  });

  test('un mot de passe temporaire expiré ne peut plus être remplacé par l’utilisateur', async () => {
    await db.query("update comptes_connexion set temporaire_expire_le = now() - interval '1 day' where user_id = $1", [user]);
    expect((await valeur(user, 'select mon_contexte()')).compte.temporaire_expire).toBe(true);
    await expect(changerMotDePasse(user, 'Nouveau-Mot-2026')).rejects.toThrow(/expiré/);
    await comme(superAdmin, "select reinitialiser_mot_de_passe_temporaire($1, '1234', 7)", [user]);
    await changerMotDePasse(user, 'Nouveau-Mot-2026');
    expect((await valeur(user, 'select mon_contexte()')).etablissements[0].role).toBe('employe');
  });
});

describe('connexion par identifiant', () => {
  test('identifiant juste : l’adresse est renvoyée ; casse indifférente', async () => {
    expect(await anon("select resoudre_connexion('patrondemo', 'Kangou-Demo-2026')")).toEqual({ ok: true, email: 'patrondemo@identifiants.test' });
    expect((await anon("select resoudre_connexion('PATRONDEMO', 'Kangou-Demo-2026')")).ok).toBe(true);
  });

  test('même réponse pour un identifiant inconnu et un mauvais mot de passe', async () => {
    const inconnu = await anon("select resoudre_connexion('personne', 'x')");
    const faux = await anon("select resoudre_connexion('Userdemo', 'mauvais')");
    expect(inconnu).toEqual({ ok: false, message: 'Identifiant ou mot de passe incorrect' });
    expect(faux).toEqual(inconnu);
    expect(JSON.stringify(faux)).not.toContain('@');
  });

  test('5 échecs bloquent l’identifiant 15 minutes, même avec le bon mot de passe', async () => {
    for (let i = 0; i < 5; i += 1) await anon("select resoudre_connexion('Userdemo', 'mauvais')");
    expect((await anon("select resoudre_connexion('Userdemo', 'Nouveau-Mot-2026')")).message).toMatch(/Trop de tentatives/);
    await db.query("update tentatives_connexion set bloque_jusqu_au = now() - interval '1 second', derniere_le = now() - interval '20 minutes'");
    expect((await anon("select resoudre_connexion('Userdemo', 'Nouveau-Mot-2026')")).ok).toBe(true);
  });

  test('anon ne lit ni comptes ni tentatives, et n’exécute que la résolution', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select * from tentatives_connexion'))).rejects.toThrow(/permission denied/);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from comptes_connexion'))).rows).toEqual([]);
    await expect(anon("select creer_compte('a@b.cc', 'Anonyme', 'A', '1234')")).rejects.toThrow(/permission denied/);
  });
});

describe('escalades de privilèges refusées', () => {
  test('Admin gère clients et licences mais ni tarifs, ni administrateurs, ni le super admin', async () => {
    await comme(superAdmin, "select reinitialiser_mot_de_passe_temporaire($1, '1234', 7)", [admin]).catch(() => {});
    await changerMotDePasse(admin, 'Admin-Agence-2026');
    expect((await valeur(admin, 'select editeur_vue()')).clients.length).toBeGreaterThan(0);
    const autre = await valeur(admin, "select creer_client('Client créé par Admin')");
    expect(autre).toBeTruthy();
    await expect(comme(admin, 'select enregistrer_offre($1::jsonb)', [JSON.stringify({ id: 'commerce_essentiel', nom: 'Hack', prix_mensuel: 1 })])).rejects.toThrow(/super administrateurs/);
    await expect(comme(admin, "select definir_admin_plateforme($1, 'super_admin')", [user])).rejects.toThrow(/super administrateurs/);
    await expect(comme(admin, "select reinitialiser_mot_de_passe_temporaire($1, '1234')", [superAdmin])).rejects.toThrow(/super administrateur/);
    await expect(comme(admin, "select definir_identifiant($1, 'Pirate')", [superAdmin])).rejects.toThrow(/super administrateur/);
    await expect(comme(admin, "insert into plateforme_admins(user_id, role) values ($1, 'super_admin')", [user])).rejects.toThrow();
    await expect(comme(admin, "update plateforme_admins set role = 'super_admin' where user_id = $1", [admin])).resolves.toEqual([]);
    expect((await db.query('select role from plateforme_admins where user_id = $1', [admin])).rows[0].role).toBe('admin');
  });

  test('Patron ne devient pas Admin ; Userdemo ne devient pas Patron', async () => {
    await expect(comme(patron, 'select editeur_vue()')).rejects.toThrow(/réservée/);
    await expect(comme(patron, "select definir_admin_plateforme($1, 'admin')", [patron])).rejects.toThrow(/super administrateurs/);
    await expect(comme(user, "select modifier_membre($1, $2, 'gerant')", [etab, user])).rejects.toThrow(/Permission refusée|propre/);
    await expect(comme(user, "update etablissement_membres set role_id = 'gerant' where user_id = $1", [user])).resolves.toEqual([]);
    expect((await db.query('select role_id from etablissement_membres where user_id = $1', [user])).rows[0].role_id).toBe('employe');
    await expect(comme(user, "select enregistrer_hub($1, '{\"nom\":\"X\"}'::jsonb)", [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(user, "select reinitialiser_mot_de_passe_temporaire($1, '1234')", [patron])).rejects.toThrow(/réservée/);
  });

  test('le super admin ne peut pas se retirer son propre rôle', async () => {
    await expect(comme(superAdmin, "select definir_admin_plateforme($1, 'admin')", [superAdmin])).rejects.toThrow(/propre rôle/);
  });
});
