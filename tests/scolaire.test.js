import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Scolaire (M09, Bêta) : années, classes, élèves, inscriptions (capacité, remise), paiements, fin d'inscription, droits.
let db;
let sa;
let gerant;
let secretaire;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let annee;
let cp;
let parent;
let eleve1;
let eleve2;
let inscription;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const rpc = (user, fn, p) => valeur(user, `select ${fn}($1, $2::jsonb)`, [etab, json(p)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@sc.test');
  gerant = await utilisateur('gerant@sc.test');
  secretaire = await utilisateur('secretariat@sc.test');
  lecteur = await utilisateur('lecteur@sc.test');
  autreGerant = await utilisateur('autre@sc.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('École Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'École Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  await comme(sa, "select accorder_module($1, 'scolaire', true)", [etab]);
  await comme(sa, "select definir_module_etablissement($1, 'scolaire', true)", [etab]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'secretariat'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, secretaire, lecteur, autreEtab, autreGerant]
  );
  parent = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Parent Test', type: 'client' })]);
});

afterAll(async () => db.close());

describe('scolaire', () => {
  test('année active unique, classes, droits', async () => {
    const a1 = await rpc(gerant, 'enregistrer_annee_scolaire', { libelle: '2025-2026', debut: '2025-09-01', fin: '2026-07-01', active: true });
    annee = await rpc(gerant, 'enregistrer_annee_scolaire', { libelle: '2026-2027', debut: '2026-09-01', fin: '2027-07-01', active: true });
    expect((await db.query('select id from sco_annees where active')).rows.map((r) => r.id)).toEqual([annee]);
    expect(a1).not.toBe(annee);
    await expect(rpc(secretaire, 'enregistrer_annee_scolaire', { libelle: 'X', debut: '2026-09-01', fin: '2027-07-01' })).rejects.toThrow(/Permission refusée/);
    cp = await rpc(gerant, 'enregistrer_classe', { annee_id: annee, nom: 'CP A', niveau: 'CP', capacite: 1, frais_inscription: 20000, frais_scolarite: 150000 });
    await expect(rpc(gerant, 'enregistrer_classe', { annee_id: annee, nom: 'CP A' })).rejects.toThrow(/existe déjà/);
  });

  test('élèves : matricule automatique, responsable du même établissement', async () => {
    eleve1 = await rpc(secretaire, 'enregistrer_eleve', { nom: 'Élève', prenom: 'Un', responsable_id: parent });
    eleve2 = await rpc(secretaire, 'enregistrer_eleve', { nom: 'Élève', prenom: 'Deux', matricule: 'M-2' });
    expect((await db.query('select matricule from sco_eleves where id = $1', [eleve1])).rows[0].matricule).toBe('EL-00001');
    await expect(rpc(secretaire, 'enregistrer_eleve', { nom: 'Doublon', matricule: 'M-2' })).rejects.toThrow(/existe déjà/);
    const autreParent = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Ailleurs', type: 'client' })]);
    await expect(rpc(secretaire, 'enregistrer_eleve', { nom: 'X', responsable_id: autreParent })).rejects.toThrow(/Responsable introuvable/);
  });

  test('inscription : frais figés, capacité, remise réservée au responsable', async () => {
    await expect(rpc(secretaire, 'inscrire_eleve', { eleve_id: eleve1, classe_id: cp, remise: 10000, motif_remise: 'Fratrie' })).rejects.toThrow(/responsable accorde/);
    await expect(rpc(gerant, 'inscrire_eleve', { eleve_id: eleve1, classe_id: cp, remise: 10000 })).rejects.toThrow(/motif/);
    inscription = await rpc(gerant, 'inscrire_eleve', { eleve_id: eleve1, classe_id: cp, remise: 10000, motif_remise: 'Fratrie' });
    expect((await db.query('select montant_du, remise from sco_inscriptions where id = $1', [inscription])).rows[0]).toEqual({ montant_du: '170000.00', remise: '10000.00' });
    await expect(rpc(secretaire, 'inscrire_eleve', { eleve_id: eleve1, classe_id: cp })).rejects.toThrow(/déjà inscrit|complète/);
    await expect(rpc(secretaire, 'inscrire_eleve', { eleve_id: eleve2, classe_id: cp })).rejects.toThrow(/Classe complète/);
  });

  test('paiements : reçu numéroté, jamais plus que le reste', async () => {
    const r = await valeur(secretaire, "select encaisser_scolarite($1, 60000, 'mobile_money', 'MM-1')", [inscription]);
    expect(r).toEqual({ numero: 'RS-00001', reste: 100000 });
    await expect(comme(secretaire, "select encaisser_scolarite($1, 100001, 'especes')", [inscription])).rejects.toThrow(/dépasse/);
    await expect(comme(lecteur, "select encaisser_scolarite($1, 1, 'especes')", [inscription])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'delete from sco_paiements')).rejects.toThrow(/permission denied/);
    await expect(db.query("update sco_paiements set montant = 1")).rejects.toThrow();
  });

  test('fin d’inscription libère une place', async () => {
    await expect(comme(secretaire, "select terminer_inscription($1, 'abandon', 'Déménagement')", [inscription])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select terminer_inscription($1, 'transfere', 'Déménagement')", [inscription]);
    await rpc(secretaire, 'inscrire_eleve', { eleve_id: eleve2, classe_id: cp });
  });

  test('isolation et tableau de bord', async () => {
    expect(await comme(autreGerant, 'select id from sco_eleves')).toEqual([]);
    expect(await comme(autreGerant, 'select id from sco_paiements')).toEqual([]);
    await expect(rpc(autreGerant, 'enregistrer_eleve', { nom: 'Intrus' })).rejects.toThrow(/Permission refusée/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select encaisser_scolarite($1, 1, 'especes')", [inscription]))).rejects.toThrow(/permission denied/);
    expect((await valeur(gerant, 'select cockpit_domaines($1)', [etab])).map((d) => d.id)).toContain('scolaire');
    const auj = new Date().toISOString().slice(0, 10);
    const c = await valeur(gerant, 'select cockpit_scolaire($1, $2::date - 6, $2::date)', [etab, auj]);
    expect(c.kpis.find((k) => k.cle === 'inscrits').valeur).toBe(1);
    expect(c.kpis.find((k) => k.cle === 'encaisse').valeur).toBe(60000);
  });
});
