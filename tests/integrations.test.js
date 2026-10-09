import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Socle des intégrations (migration 20261010000103) : droits, isolement, secrets jamais lisibles, idempotence.
let db;
let admin;
let gerant;
let responsable;
let autre;
let etab;
let autreEtab;
let connexion;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const service = (sql, params = []) => commeRole(db, 'service_role', null, async (tx) => (await tx.query(sql, params)).rows);
const CHIFFRE = 'v1:AAAAAAAAAAAAAAAA:QUJDREVGR0g=';

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@integrations.test'); gerant = await utilisateur('gerant@integrations.test');
  responsable = await utilisateur('responsable@integrations.test'); autre = await utilisateur('autre@integrations.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Intégrations Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique connectée')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Autre boutique')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values ($1,$2,'gerant'),($1,$3,'responsable'),($4,$5,'gerant')", [etab, gerant, responsable, autreEtab, autre]);
});

afterAll(async () => db.close());

describe('connexions', () => {
  test('le gérant connecte ; la clé n\'est jamais lisible, seul son aperçu l\'est', async () => {
    connexion = await valeur(gerant, "select enregistrer_connexion_integration($1,'simulation','test',$2::jsonb,$3,'••••abcd',$3)",
      [etab, JSON.stringify({ libelle: 'Essai' }), CHIFFRE]);
    const [ligne] = await comme(gerant, 'select * from integrations_connexions where id=$1', [connexion]);
    expect(ligne).toMatchObject({ fournisseur: 'simulation', mode: 'test', actif: true, secret_apercu: '••••abcd', config: { libelle: 'Essai' } });
    expect(Object.keys(ligne).some((k) => k.includes('chiffre'))).toBe(false);
    await expect(comme(gerant, 'select * from integrations_secrets')).rejects.toThrow(/permission denied/);
    // Le serveur relit le texte chiffré (illisible sans la clé du serveur).
    expect(await valeur(gerant, 'select lire_secrets_integration($1)', [connexion])).toMatchObject({ secret_chiffre: CHIFFRE, mode: 'test' });
  });

  test('saisie refusée : clé dans les réglages, texte non chiffré, fournisseur ou mode inconnu', async () => {
    await expect(comme(gerant, "select enregistrer_connexion_integration($1,'simulation','test',$2::jsonb)", [etab, JSON.stringify({ api_key: 'x' })])).rejects.toThrow(/clé secrète/);
    await expect(comme(gerant, "select enregistrer_connexion_integration($1,'simulation','test','{}'::jsonb,'cle-en-clair')", [etab])).rejects.toThrow(/check/);
    await expect(comme(gerant, "select enregistrer_connexion_integration($1,'Mauvais Nom','test')", [etab])).rejects.toThrow(/Fournisseur inconnu/);
    await expect(comme(gerant, "select enregistrer_connexion_integration($1,'simulation','prod')", [etab])).rejects.toThrow(/Mode inconnu/);
  });

  test('droits et isolement : responsable, autre établissement et anonyme refusés', async () => {
    await expect(comme(responsable, "select enregistrer_connexion_integration($1,'simulation','test')", [etab])).rejects.toThrow(/Permission refusée/);
    expect(await comme(responsable, 'select id from integrations_connexions')).toEqual([]);
    await expect(comme(autre, 'select lire_secrets_integration($1)', [connexion])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autre, 'select desactiver_connexion_integration($1)', [connexion])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autre, 'select id from integrations_connexions')).toEqual([]);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select lire_secrets_integration($1)', [connexion]))).rejects.toThrow(/permission denied/);
    // Les fonctions des webhooks sont réservées à la clé service.
    await expect(comme(gerant, "select connexion_pour_webhook($1,'simulation')", [connexion])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, "select recevoir_evenement_integration($1,'e1','t','ok')", [connexion])).rejects.toThrow(/permission denied/);
  });

  test('journal des appels, sans modification ni suppression', async () => {
    await valeur(gerant, "select journaliser_appel_integration($1,'test','ok',null,12,'sim_1')", [connexion]);
    const journal = await comme(gerant, 'select operation, statut, duree_ms, sens from integrations_journal where connexion_id=$1', [connexion]);
    expect(journal).toEqual([{ operation: 'test', statut: 'ok', duree_ms: 12, sens: 'sortant' }]);
    await expect(db.query('update integrations_journal set statut=$1', ['erreur'])).rejects.toThrow();
    await expect(db.query('delete from integrations_journal')).rejects.toThrow();
    await expect(db.query('delete from integrations_connexions')).rejects.toThrow();
  });
});

describe('événements entrants', () => {
  test('idempotence : le même événement est noté « doublon » et non retraité', async () => {
    expect((await service("select connexion_pour_webhook($1,'simulation') r", [connexion]))[0].r).toMatchObject({ actif: true, webhook_secret_chiffre: CHIFFRE });
    expect((await service("select connexion_pour_webhook($1,'carte') r", [connexion]))[0].r).toBeNull();
    expect((await service("select recevoir_evenement_integration($1,'evt_1','paiement.recu','ok') r", [connexion]))[0].r).toEqual({ doublon: false });
    expect((await service("select recevoir_evenement_integration($1,'evt_1','paiement.recu','ok') r", [connexion]))[0].r).toEqual({ doublon: true });
    expect((await service("select recevoir_evenement_integration($1,'evt_2','paiement.recu','ok') r", [connexion]))[0].r).toEqual({ doublon: false });
    const lignes = await comme(gerant, "select statut, idempotence from integrations_journal where sens='entrant' order by cree_le, statut");
    expect(lignes.map((l) => l.statut).sort()).toEqual(['doublon', 'ok', 'ok']);
  });

  test('désactivation en un clic, réactivation par une nouvelle connexion', async () => {
    await valeur(gerant, 'select desactiver_connexion_integration($1)', [connexion]);
    expect((await service("select connexion_pour_webhook($1,'simulation') r", [connexion]))[0].r.actif).toBe(false);
    await valeur(gerant, "select enregistrer_connexion_integration($1,'simulation','test')", [etab]);
    const [ligne] = await comme(gerant, 'select actif, secret_apercu from integrations_connexions where id=$1', [connexion]);
    expect(ligne).toEqual({ actif: true, secret_apercu: '••••abcd' });
    expect(await valeur(gerant, 'select lire_secrets_integration($1)', [connexion])).toMatchObject({ secret_chiffre: CHIFFRE });
  });
});
