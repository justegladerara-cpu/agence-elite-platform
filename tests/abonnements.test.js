import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Abonnements : formules, souscription, factures périodiques sans doublon, suspension, reprise, résiliation, droits.
let db;
let sa;
let gerant;
let comptable;
let commercial;
let autreGerant;
let etab;
let autreEtab;
let client;
let mensuel;
let annuel;
let abo;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const jour = async (decalage = 0) => (await db.query('select (date_locale($1) + $2::int)::text d', [etab, decalage])).rows[0].d;
const aboDe = async (id) => (await db.query('select *, prochaine_echeance::text pe from abonnements where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ab.test');
  gerant = await utilisateur('gerant@ab.test');
  comptable = await utilisateur('comptable@ab.test');
  commercial = await utilisateur('commercial@ab.test');
  autreGerant = await utilisateur('autre@ab.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Gym Elite')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Gym Elite')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'abonnements', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'abonnements', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'comptable'), ($1, $4, 'commercial'), ($5, $6, 'gerant')`,
    [etab, gerant, comptable, commercial, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Nkounkou', telephone: '+242 06 777 66 55', type: 'client' })]);
});

afterAll(async () => db.close());

describe('abonnements', () => {
  test('formules : prix positif, périodicité connue, nom unique ; droits', async () => {
    await expect(comme(commercial, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'Mensuel', montant: 20000, periodicite: 'mensuel' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'X', montant: 0, periodicite: 'mensuel' })])).rejects.toThrow(/positif/);
    await expect(comme(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'X', montant: 10, periodicite: 'hebdo' })])).rejects.toThrow(/Périodicité/);
    mensuel = await valeur(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'Accès mensuel', montant: 20000, periodicite: 'mensuel' })]);
    annuel = await valeur(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'Accès annuel', montant: 200000, periodicite: 'annuel' })]);
    await expect(comme(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'accès MENSUEL', montant: 1, periodicite: 'mensuel' })])).rejects.toThrow(/existe déjà/);
  });

  test('souscription et facturation des périodes dues, sans doublon', async () => {
    abo = await valeur(comptable, 'select souscrire_abonnement($1, $2::jsonb)', [etab, json({ contact_id: client, formule_id: mensuel, debut: await jour(-65), prix: 18000 })]);
    expect((await aboDe(abo)).numero).toMatch(/^AB-/);
    const r = await valeur(comptable, 'select facturer_abonnements($1)', [etab]);
    expect(r.factures).toBe(3);
    expect(Number(r.montant)).toBe(54000);
    const periodes = await comme(comptable, 'select periode_debut::text d, periode_fin::text f, document_id from abonnement_periodes where abonnement_id = $1 order by periode_debut', [abo]);
    expect(periodes).toHaveLength(3);
    expect(periodes[0].d).toBe(await jour(-65));
    const docs = (await db.query('select statut, total_ttc from documents_vente where id = any($1)', [periodes.map((p) => p.document_id)])).rows;
    expect(docs.every((d) => d.statut === 'emise' && Number(d.total_ttc) === 18000)).toBe(true);
    expect((await valeur(comptable, 'select facturer_abonnements($1)', [etab])).factures).toBe(0);
    expect((await aboDe(abo)).pe > await jour(0)).toBe(true);
    await expect(comme(comptable, 'select facturer_abonnements($1, $2::date)', [etab, await jour(60)])).rejects.toThrow(/un mois/);
  });

  test('suspension (motif), reprise sans facturer la pause, résiliation définitive', async () => {
    await expect(comme(gerant, "select changer_statut_abonnement($1, 'suspendu')", [abo])).rejects.toThrow(/motif/);
    await comme(gerant, "select changer_statut_abonnement($1, 'suspendu', 'Voyage')", [abo]);
    await db.query("update abonnements set prochaine_echeance = date_locale(etablissement_id) - 40 where id = $1", [abo]);
    await comme(gerant, "select changer_statut_abonnement($1, 'actif')", [abo]);
    expect((await aboDe(abo)).pe).toBe(await jour(0));
    expect((await valeur(gerant, 'select facturer_abonnements($1)', [etab])).factures).toBe(1);
    await comme(gerant, "select changer_statut_abonnement($1, 'resilie', 'Déménagement')", [abo]);
    await expect(comme(gerant, "select changer_statut_abonnement($1, 'actif')", [abo])).rejects.toThrow(/résilié/);
    expect((await valeur(gerant, 'select facturer_abonnements($1)', [etab])).factures).toBe(0);
  });

  test('isolement, tableau de bord, rien ne se supprime', async () => {
    await valeur(gerant, 'select souscrire_abonnement($1, $2::jsonb)', [etab, json({ contact_id: client, formule_id: annuel, debut: await jour(10) })]);
    expect(await comme(autreGerant, 'select id from abonnements')).toEqual([]);
    await expect(comme(autreGerant, 'select souscrire_abonnement($1, $2::jsonb)', [autreEtab, json({ contact_id: client, formule_id: mensuel })])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select tableau_de_bord_abonnements($1)', [etab])).rejects.toThrow(/Accès refusé/);
    const tdb = await valeur(commercial, 'select tableau_de_bord_abonnements($1)', [etab]);
    expect(tdb).toMatchObject({ actifs: 1, suspendus: 0, a_facturer: 0, impayes: 4 });
    expect(Number(tdb.revenu_mensuel)).toBeCloseTo(200000 / 12, 1);
    await expect(db.query('delete from abonnement_periodes')).rejects.toThrow();
  });
});
