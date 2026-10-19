// Mission 01 (SEC-01) : double authentification de l'équipe Agence Elite, contrôlée par la base.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';

let db;
let superAdmin;
let admin;
let sansFacteur;
let gerant;
let autreGerant;
let etabA;
let etabB;
let sessionSuper;
let sessionAdmin;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const nouvelleSession = async (userId, { creeIlYa = '0 minutes', finDans = null } = {}) => (await db.query(
  `insert into auth.sessions(user_id, created_at, not_after)
   values($1, now() - $2::interval, case when $3::text is null then null else now() + $3::interval end) returning id`,
  [userId, creeIlYa, finDans],
)).rows[0].id;
const facteurVerifie = (userId) => db.query("insert into auth.mfa_factors(user_id, status, friendly_name) values($1, 'verified', 'Téléphone')", [userId]);

// Jeton Supabase simulé : sub, rôle, niveau (aal1 / aal2) et identifiant de session.
function comme(userId, { aal = 'aal1', session = null, role = 'authenticated' } = {}, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    const claims = { role, aal };
    if (userId) claims.sub = userId;
    if (session) claims.session_id = session;
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return fn(tx);
  });
}
const valeur = async (tx, sql, params = []) => Object.values((await tx.query(sql, params)).rows[0])[0];

beforeAll(async () => {
  db = await creerBase();
  superAdmin = await utilisateur('super@mfa.test');
  admin = await utilisateur('admin@mfa.test');
  sansFacteur = await utilisateur('nouveau@mfa.test');
  gerant = await utilisateur('gerant@mfa.test');
  autreGerant = await utilisateur('autre@mfa.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin'), ($2, 'admin'), ($3, 'support')", [superAdmin, admin, sansFacteur]);
  const clientA = (await db.query("insert into clients(nom) values('Client A') returning id")).rows[0].id;
  const clientB = (await db.query("insert into clients(nom) values('Client B') returning id")).rows[0].id;
  etabA = (await db.query("insert into etablissements(client_id, solution_id, nom) values($1, 'commerce', 'A') returning id", [clientA])).rows[0].id;
  etabB = (await db.query("insert into etablissements(client_id, solution_id, nom) values($1, 'commerce', 'B') returning id", [clientB])).rows[0].id;
  for (const etab of [etabA, etabB]) {
    for (const module of ['etablissement', 'membres', 'tableau_de_bord']) {
      await db.query('insert into etablissement_modules(etablissement_id, module_id) values($1, $2)', [etab, module]);
    }
  }
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values($1, $2, 'gerant'), ($3, $4, 'gerant')", [etabA, gerant, etabB, autreGerant]);
  await db.query("insert into etablissement_identite(etablissement_id, nom_commercial) values($1, 'Enseigne A'), ($2, 'Enseigne B')", [etabA, etabB]);
  await facteurVerifie(superAdmin);
  await facteurVerifie(admin);
  sessionSuper = await nouvelleSession(superAdmin);
  sessionAdmin = await nouvelleSession(admin);
});

afterAll(async () => db.close());

describe('double authentification de l’équipe (aal2 exigé par la base)', () => {
  test('1. un visiteur non connecté n’a accès à aucune fonction d’administration', async () => {
    await comme(null, { role: 'anon' }, async (tx) => {
      await expect(tx.query('select public.editeur_comptes()')).rejects.toThrow();
    });
    await comme(null, { role: 'anon' }, async (tx) => {
      await expect(tx.query('select public.definir_mfa_admin_obligatoire(false)')).rejects.toThrow(/permission denied/);
    });
    await comme(null, { role: 'anon' }, async (tx) => {
      await expect(tx.query('select public.mon_etat_securite()')).rejects.toThrow(/permission denied/);
    });
  });

  test('2. un administrateur qui a un facteur mais seulement aal1 est refusé, même par appel RPC direct', async () => {
    await comme(superAdmin, { aal: 'aal1', session: sessionSuper }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
      expect(await valeur(tx, 'select public.est_editeur()')).toBe(false);
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toMatchObject({ equipe: true, double_auth_requise: true, aal: 'aal1' });
    });
    await expect(comme(superAdmin, { aal: 'aal1', session: sessionSuper }, (tx) => tx.query('select public.editeur_comptes()'))).rejects.toThrow(/réservée/);
    await expect(comme(admin, { aal: 'aal1', session: sessionAdmin }, (tx) => tx.query('select public.exiger_editeur()'))).rejects.toThrow(/réservée/);
    await expect(comme(admin, { aal: 'aal1', session: sessionAdmin }, (tx) => tx.query("select public.ouvrir_session_support($1, 'Diagnostic')", [etabA]))).rejects.toThrow(/Agence Elite/);
    // Les politiques RLS fondées sur est_super_admin() ne s'ouvrent pas non plus.
    await comme(superAdmin, { aal: 'aal1', session: sessionSuper }, async (tx) => {
      expect((await tx.query('select user_id from plateforme_admins')).rows.length).toBeLessThanOrEqual(1);
    });
  });

  test('3. un administrateur en aal2 avec les permissions est accepté', async () => {
    await comme(superAdmin, { aal: 'aal2', session: sessionSuper }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(true);
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toMatchObject({ double_auth_requise: false, facteur_verifie: true });
      await tx.query('select public.editeur_comptes()');
    });
    await comme(admin, { aal: 'aal2', session: sessionAdmin }, async (tx) => {
      expect(await valeur(tx, 'select public.est_editeur()')).toBe(true);
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
      const id = await valeur(tx, "select public.ouvrir_session_support($1, 'Diagnostic')", [etabA]);
      expect(await valeur(tx, 'select public.session_support_active($1)', [etabA])).toBe(true);
      await tx.query('select public.fermer_session_support($1)', [id]);
    });
  });

  test('3 bis. une session support ouverte en aal2 ne sert plus en aal1', async () => {
    const id = await comme(admin, { aal: 'aal2', session: sessionAdmin }, (tx) => valeur(tx, "select public.ouvrir_session_support($1, 'Diagnostic')", [etabA]));
    await comme(admin, { aal: 'aal1', session: sessionAdmin }, async (tx) => {
      expect(await valeur(tx, 'select public.session_support_active($1)', [etabA])).toBe(false);
    });
    await comme(admin, { aal: 'aal2', session: sessionAdmin }, (tx) => tx.query('select public.fermer_session_support($1)', [id]));
  });

  test('4. un utilisateur normal ne peut ni se donner les droits ni toucher aux réglages de sécurité', async () => {
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [gerant]))).rejects.toThrow();
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('update securite_plateforme set mfa_admin_obligatoire = false'))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('select * from securite_plateforme'))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('select public.admin_mfa_ok()'))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('select public.definir_mfa_admin_obligatoire(false)'))).rejects.toThrow(/réservée/);
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('select public.revoquer_sessions_compte($1)', [superAdmin]))).rejects.toThrow(/réservée/);
    await comme(gerant, { aal: 'aal2' }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toEqual({ connecte: true, equipe: false, double_auth_requise: false, enrolement_requis: false });
      // Journal : un compte client n'écrit rien.
      await tx.query("select public.journaliser_securite('connexion_admin')");
    });
    expect((await db.query("select count(*)::int n from evenements where donnees->>'compte' = $1", [gerant])).rows[0].n).toBe(0);
  });

  test('5. un client ne lit pas les données d’un autre établissement', async () => {
    await comme(gerant, { aal: 'aal1' }, async (tx) => {
      expect((await tx.query('select nom_commercial from etablissement_identite')).rows).toEqual([{ nom_commercial: 'Enseigne A' }]);
      expect((await tx.query('select id from etablissements')).rows.map((r) => r.id)).toEqual([etabA]);
      expect((await tx.query('select id from etablissements where id = $1', [etabB])).rows).toHaveLength(0);
    });
  });

  test('6. transition sans verrouillage, puis mode obligatoire ; les utilisateurs ordinaires ne sont pas touchés', async () => {
    const sessionNouveau = await nouvelleSession(sansFacteur);
    // Avant le mode obligatoire : un compte de l'équipe sans téléphone garde ses droits (il peut enrôler).
    await comme(sansFacteur, { aal: 'aal1', session: sessionNouveau }, async (tx) => {
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toMatchObject({ double_auth_requise: false, enrolement_requis: false, facteur_verifie: false });
      const id = await valeur(tx, "select public.ouvrir_session_support($1, 'Aide')", [etabA]);
      await tx.query('select public.fermer_session_support($1)', [id]);
    });
    // Activation refusée en aal1, puis refusée tant qu'un compte actif n'a pas de facteur.
    await expect(comme(superAdmin, { aal: 'aal1', session: sessionSuper }, (tx) => tx.query('select public.definir_mfa_admin_obligatoire(true)'))).rejects.toThrow(/réservée/);
    await expect(comme(superAdmin, { aal: 'aal2', session: sessionSuper }, (tx) => tx.query('select public.definir_mfa_admin_obligatoire(true)'))).rejects.toThrow(/1 compte\(s\) actif\(s\)/);
    expect((await db.query('select mfa_admin_obligatoire from securite_plateforme')).rows[0].mfa_admin_obligatoire).toBe(false);
    // Le dernier compte enrôle son téléphone : l'activation passe.
    await facteurVerifie(sansFacteur);
    await comme(superAdmin, { aal: 'aal2', session: sessionSuper }, (tx) => tx.query('select public.definir_mfa_admin_obligatoire(true)'));
    expect((await db.query('select mfa_admin_obligatoire from securite_plateforme')).rows[0].mfa_admin_obligatoire).toBe(true);
    await comme(sansFacteur, { aal: 'aal1', session: sessionNouveau }, async (tx) => {
      expect(await valeur(tx, 'select public.est_equipe_plateforme()')).toBe(false);
    });
    // Un nouveau compte d'équipe sans facteur, en mode obligatoire : enrôlement exigé, aucun droit.
    const recrue = await utilisateur('recrue@mfa.test');
    await db.query("insert into plateforme_admins(user_id, role) values($1, 'admin')", [recrue]);
    await comme(recrue, { aal: 'aal1', session: await nouvelleSession(recrue) }, async (tx) => {
      expect(await valeur(tx, 'select public.est_editeur()')).toBe(false);
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toMatchObject({ enrolement_requis: true });
    });
    // Utilisateurs ordinaires : rien ne change, même en mode obligatoire et en aal1.
    await comme(gerant, { aal: 'aal1', session: await nouvelleSession(gerant) }, async (tx) => {
      expect((await tx.query('select nom_commercial from etablissement_identite')).rows).toEqual([{ nom_commercial: 'Enseigne A' }]);
      expect(await valeur(tx, 'select public.a_permission($1, $2)', [etabA, 'membres.gerer'])).toBe(true);
    });
    // Retour arrière : désactivation par un super administrateur en aal2.
    await comme(superAdmin, { aal: 'aal2', session: sessionSuper }, (tx) => tx.query('select public.definir_mfa_admin_obligatoire(false)'));
    await db.query("update plateforme_admins set actif = false where user_id = $1", [recrue]);
    expect((await db.query("select count(*)::int n from evenements where type = 'securite.mfa_obligatoire'")).rows[0].n).toBe(2);
  });

  test('7. une session révoquée, expirée ou trop ancienne ne permet plus aucune action sensible', async () => {
    const s = await nouvelleSession(superAdmin);
    await comme(superAdmin, { aal: 'aal2', session: s }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(true);
    });
    await db.query('delete from auth.sessions where id = $1', [s]);
    await comme(superAdmin, { aal: 'aal2', session: s }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
      expect(await valeur(tx, 'select public.mon_etat_securite()')).toMatchObject({ reconnexion_requise: true });
    });
    await expect(comme(superAdmin, { aal: 'aal2', session: s }, (tx) => tx.query('select public.editeur_comptes()'))).rejects.toThrow(/réservée/);
    const ancienne = await nouvelleSession(superAdmin, { creeIlYa: '13 hours' });
    await comme(superAdmin, { aal: 'aal2', session: ancienne }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
    });
    const finie = await nouvelleSession(superAdmin, { finDans: '-1 minute' });
    await comme(superAdmin, { aal: 'aal2', session: finie }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
    });
    // Session d'un autre compte : refusée.
    await comme(superAdmin, { aal: 'aal2', session: sessionAdmin }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(false);
    });
  });

  test('7 bis. un super administrateur en aal2 ferme toutes les sessions d’un autre compte', async () => {
    const a = await nouvelleSession(admin);
    await expect(comme(superAdmin, { aal: 'aal1', session: sessionSuper }, (tx) => tx.query('select public.revoquer_sessions_compte($1)', [admin]))).rejects.toThrow(/réservée/);
    await expect(comme(superAdmin, { aal: 'aal2', session: sessionSuper }, (tx) => tx.query('select public.revoquer_sessions_compte($1)', [superAdmin]))).rejects.toThrow(/autres sessions/);
    const n = await comme(superAdmin, { aal: 'aal2', session: sessionSuper }, (tx) => valeur(tx, 'select public.revoquer_sessions_compte($1)', [admin]));
    expect(n).toBeGreaterThanOrEqual(2);
    await comme(admin, { aal: 'aal2', session: a }, async (tx) => {
      expect(await valeur(tx, 'select public.est_editeur()')).toBe(false);
    });
    sessionAdmin = await nouvelleSession(admin);
  });

  test('journal : connexions, facteurs et événements de l’application, pour l’équipe seulement', async () => {
    const avant = (await db.query("select count(*)::int n from evenements where type like 'securite.%'")).rows[0].n;
    const s = await nouvelleSession(superAdmin);
    await db.query("update auth.sessions set aal = 'aal2' where id = $1", [s]);
    await nouvelleSession(gerant);
    const types = (await db.query("select type from evenements where type like 'securite.%' order by id desc limit 2")).rows.map((r) => r.type);
    expect(types).toEqual(['securite.connexion_aal2', 'securite.connexion']);
    expect((await db.query("select count(*)::int n from evenements where type like 'securite.%'")).rows[0].n).toBe(avant + 2);
    expect((await db.query("select count(*)::int n from evenements where type = 'securite.facteur_ajoute'")).rows[0].n).toBe(3);
    await comme(superAdmin, { aal: 'aal1', session: s }, async (tx) => {
      await tx.query("select public.journaliser_securite('mfa_code_refuse', '{\"essai\": 1}')");
    });
    await expect(comme(superAdmin, { aal: 'aal1', session: s }, (tx) => tx.query("select public.journaliser_securite('n_importe_quoi')"))).rejects.toThrow(/inconnu/);
    expect((await db.query("select count(*)::int n from evenements where type = 'securite.mfa_code_refuse'")).rows[0].n).toBe(1);
    // Ajout seul ; lisible par un super administrateur en aal2 uniquement, par une fonction dédiée.
    await expect(db.query("delete from evenements where type = 'securite.connexion'")).rejects.toThrow(/ajout seul/);
    await comme(superAdmin, { aal: 'aal2', session: s }, async (tx) => {
      expect(await valeur(tx, 'select public.est_super_admin()')).toBe(true);
      const journal = await valeur(tx, 'select public.editeur_journal_securite(50)');
      expect(journal.map((e) => e.type)).toContain('securite.mfa_code_refuse');
    });
    await comme(gerant, { aal: 'aal2' }, async (tx) => {
      expect((await tx.query("select type from evenements where type like 'securite.%'")).rows).toHaveLength(0);
    });
    await expect(comme(gerant, { aal: 'aal2' }, (tx) => tx.query('select public.editeur_journal_securite()'))).rejects.toThrow(/réservée/);
    await expect(comme(superAdmin, { aal: 'aal1', session: s }, (tx) => tx.query('select public.editeur_journal_securite()'))).rejects.toThrow(/réservée/);
  });
});
