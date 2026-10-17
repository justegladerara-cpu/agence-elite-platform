import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Le responsable donne un mot de passe provisoire à son équipe (migration 20261017000133).
let db;
let superAdmin;
let gerant;
let gerant2;
let responsable;
let caissiere;
let multi;
let etab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const changer = (u, cible, mdp = 'abcd1') => comme(u, 'select reinitialiser_mot_de_passe_membre($1, $2, $3)', [etab, cible, mdp]);
const etat = async (u) => (await db.query('select doit_changer_mot_de_passe d, temporaire_expire_le > now() + interval \'6 days\' e from comptes_connexion where user_id = $1', [u])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  superAdmin = await utilisateur('sa@mdp.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [superAdmin]);
  const client = await valeur(superAdmin, "select creer_client('Bar Mdp')");
  const autreClient = await valeur(superAdmin, "select creer_client('Autre Entreprise')");
  etab = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Bar Mdp')", [client]);
  const ailleurs = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Ailleurs')", [autreClient]);
  [gerant, gerant2, responsable, caissiere, multi] = await Promise.all(['g', 'g2', 'r', 'c', 'm'].map((x) => utilisateur(`${x}@mdp.test`)));
  await db.query(`insert into etablissement_membres(etablissement_id, user_id, role_id) values
    ($1, $2, 'gerant'), ($1, $3, 'gerant'), ($1, $4, 'responsable'), ($1, $5, 'employe'), ($1, $6, 'employe'), ($7, $6, 'employe')`,
  [etab, gerant, gerant2, responsable, caissiere, multi, ailleurs]);
}, 60000);

afterAll(async () => db?.close());

describe('nouveau mot de passe pour l’équipe', () => {
  test('le gérant change celui d’une caissière : provisoire, à changer, 7 jours, noté sans le mot de passe', async () => {
    const avant = (await db.query('select encrypted_password from auth.users where id = $1', [caissiere])).rows[0].encrypted_password;
    await changer(gerant, caissiere);
    const apres = (await db.query('select encrypted_password from auth.users where id = $1', [caissiere])).rows[0].encrypted_password;
    expect(apres).not.toBe(avant);
    expect(apres).not.toContain('abcd1');
    expect(await etat(caissiere)).toEqual({ d: true, e: true });
    const ev = (await db.query("select acteur, donnees from evenements where type = 'mot_de_passe_reinitialise' and etablissement_id = $1", [etab])).rows;
    expect(ev).toEqual([{ acteur: gerant, donnees: { pour: caissiere } }]);
  });

  test('il faut le droit « gérer l’équipe » (un responsable ne l’a pas par défaut)', async () => {
    await expect(changer(responsable, caissiere)).rejects.toThrow(/Permission refusée/);
    await expect(changer(responsable, gerant)).rejects.toThrow(/Permission refusée/);
  });

  test('un gérant ne touche pas un autre gérant ; personne ne change le sien ici', async () => {
    await expect(changer(gerant, gerant2)).rejects.toThrow(/rôle en dessous du vôtre/);
    await expect(changer(gerant, gerant)).rejects.toThrow(/depuis votre profil/);
  });

  test('une employée ne peut rien changer', async () => {
    await expect(changer(caissiere, multi)).rejects.toThrow(/Permission refusée/);
  });

  test('une personne qui travaille aussi chez un autre client : seulement Agence Elite', async () => {
    await expect(changer(gerant, multi)).rejects.toThrow(/autre entreprise/);
    await changer(superAdmin, multi);
    expect((await etat(multi)).d).toBe(true);
  });

  test('un compte Agence Elite : jamais par le gérant ; quelqu’un hors de l’équipe : refusé', async () => {
    await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'employe')", [etab, superAdmin]);
    await expect(changer(gerant, superAdmin)).rejects.toThrow(/Seul un super administrateur/);
    const inconnu = await utilisateur('x@mdp.test');
    await expect(changer(gerant, inconnu)).rejects.toThrow(/ne fait pas partie de l’équipe|ne fait pas partie de l'équipe/);
  });

  test('mot de passe trop court refusé ; le super admin peut aussi changer celui d’un gérant', async () => {
    await expect(changer(gerant, caissiere, 'ab')).rejects.toThrow(/au moins 4 caractères/);
    await changer(superAdmin, gerant);
    expect((await etat(gerant)).d).toBe(true);
  });
});
