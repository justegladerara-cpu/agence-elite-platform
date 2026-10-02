import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Création directe d'un compte d'équipe sans e-mail (migration 14).
let db;
let superAdmin;
let gerant;
let caissier;
let autreGerant;
let etab;
let autreEtab;
let hubPrincipal;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const creer = (u, params) => valeur(u, 'select creer_membre_sans_email($1, $2, $3, $4, $5, $6, $7)', params);

beforeAll(async () => {
  db = await creerBase();
  superAdmin = await utilisateur('sa@membres.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [superAdmin]);
  const client = await valeur(superAdmin, "select creer_client('Client Test')");
  etab = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Boutique Test')", [client]);
  autreEtab = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Autre Boutique')", [client]);
  gerant = await utilisateur('gerant@membres.test');
  caissier = await utilisateur('caissier@membres.test');
  autreGerant = await utilisateur('autre@membres.test');
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($4, $5, 'gerant')",
    [etab, gerant, caissier, autreEtab, autreGerant]);
  hubPrincipal = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
}, 60000);

afterAll(async () => db?.close());

describe('compte d’équipe sans e-mail', () => {
  test('Agence Elite crée un responsable directement membre, sans invitation', async () => {
    const r = await creer(superAdmin, [etab, 'Kevin.resp', 'Kevin Responsable', 'gerant', '1234', null, null]);
    expect(r.identifiant).toBe('Kevin.resp');
    const m = (await db.query('select role_id, actif from etablissement_membres where etablissement_id = $1 and user_id = $2', [etab, r.user_id])).rows[0];
    expect(m).toEqual({ role_id: 'gerant', actif: true });
    const u = (await db.query('select email, email_confirmed_at is not null confirme from auth.users where id = $1', [r.user_id])).rows[0];
    expect(u).toEqual({ email: 'kevin.resp@identifiants.agence-elite.fr', confirme: true });
    const c = (await db.query('select doit_changer_mot_de_passe from comptes_connexion where user_id = $1', [r.user_id])).rows[0];
    expect(c.doit_changer_mot_de_passe).toBe(true);
    expect((await db.query('select count(*)::int n from invitations where etablissement_id = $1', [etab])).rows[0].n).toBe(0);
    expect((await db.query('select nom_complet from profils where id = $1', [r.user_id])).rows[0].nom_complet).toBe('Kevin Responsable');
  });

  test('le responsable crée un caissier limité à un Hub', async () => {
    const r = await creer(gerant, [etab, 'Awa.caisse', 'Awa Caisse', 'employe', '1234', [hubPrincipal], null]);
    const hubs = (await db.query('select hub_id from membre_hubs where user_id = $1', [r.user_id])).rows.map((h) => h.hub_id);
    expect(hubs).toEqual([hubPrincipal]);
  });

  test('refus : sans droit d’équipe, autre établissement, rôle supérieur, e-mail imposé, doublon', async () => {
    await expect(creer(caissier, [etab, 'Pirate1', 'Pirate', 'employe', '1234', null, null])).rejects.toThrow();
    await expect(creer(autreGerant, [etab, 'Pirate2', 'Pirate', 'employe', '1234', null, null])).rejects.toThrow();
    await expect(creer(gerant, [etab, 'Victime', 'Victime', 'employe', '1234', null, 'quelquun@exemple.test'])).rejects.toThrow(/Agence Elite/);
    await expect(creer(gerant, [etab, 'awa.CAISSE', 'Doublon', 'employe', '1234', null, null])).rejects.toThrow(/déjà utilisé/);
    await expect(creer(gerant, [etab, 'Court', 'Court', 'employe', '12', null, null])).rejects.toThrow(/4 caractères/);
    await expect(creer(gerant, [etab, 'HubEtranger', 'X', 'employe', '1234', [(await db.query('select id from hubs where etablissement_id = $1', [autreEtab])).rows[0].id], null])).rejects.toThrow(/Hub inconnu/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select creer_membre_sans_email($1, 'Anon', 'Anon', 'employe', '1234')", [etab]))).rejects.toThrow();
    await expect(comme(superAdmin, "select creer_compte_auth('a@b.test', 'Direct', 'Direct', '1234', 30)")).rejects.toThrow();
  });
});
