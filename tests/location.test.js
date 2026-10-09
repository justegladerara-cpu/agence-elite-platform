import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Location (M07, Bêta) : parc, contrats, chevauchements refusés, remise, retour, caution, paiements, droits, isolation.
let db;
let sa;
let gerant;
let employe;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let tente;
let sono;
let contrat;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const contratDe = async (id) => (await db.query('select * from loc_contrats where id = $1', [id])).rows[0];
const louer = (user, objets, debut, fin, extra = {}) => valeur(user, 'select creer_contrat_location($1, $2::jsonb)', [etab, json({ contact_id: client, objets, debut, fin_prevue: fin, ...extra })]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@lo.test');
  gerant = await utilisateur('gerant@lo.test');
  employe = await utilisateur('employe@lo.test');
  lecteur = await utilisateur('lecteur@lo.test');
  autreGerant = await utilisateur('autre@lo.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Location Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Location Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, employe, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Fête', type: 'client' })]);
});

afterAll(async () => db.close());

describe('location', () => {
  test('sans le module : refusé', async () => {
    await expect(comme(gerant, 'select enregistrer_objet_location($1, $2::jsonb)', [etab, json({ nom: 'Tente', tarif_jour: 10000 })])).rejects.toThrow(/Permission refusée/);
  });

  test('parc : objets, référence unique, droits', async () => {
    await comme(sa, "select accorder_module($1, 'location', true)", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'location', true)", [etab]);
    const objet = (p, user = gerant) => valeur(user, 'select enregistrer_objet_location($1, $2::jsonb)', [etab, json(p)]);
    tente = await objet({ nom: 'Tente 5 × 10 m', reference: 'TEN-01', tarif_jour: 25000, caution: 50000 });
    sono = await objet({ nom: 'Sonorisation', reference: 'SON-01', tarif_jour: 15000, caution: 30000 });
    await expect(objet({ nom: 'Doublon', reference: 'ten-01', tarif_jour: 1 })).rejects.toThrow(/existe déjà/);
    await expect(objet({ nom: 'Prix négatif', tarif_jour: -1 })).rejects.toThrow(/Tarif/);
    await expect(objet({ nom: 'Par employé', tarif_jour: 1 }, employe)).rejects.toThrow(/Permission refusée/);
  });

  test('contrat : montant et caution calculés, chevauchement refusé', async () => {
    const r = await louer(employe, [tente, sono], '2026-11-01', '2026-11-03');
    expect(r).toMatchObject({ numero: 'LC-00001', jours: 2, montant_prevu: 80000 });
    contrat = r.id;
    expect(await contratDe(contrat)).toMatchObject({ statut: 'reserve', caution_montant: '80000.00', caution_statut: 'a_recevoir' });
    await expect(louer(employe, [tente], '2026-11-03', '2026-11-05')).rejects.toThrow(/Déjà loué sur ces dates : Tente/);
    const autre = await louer(employe, [tente], '2026-11-04', '2026-11-05');
    await expect(comme(employe, "select annuler_contrat_location($1, 'test')", [autre.id])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select annuler_contrat_location($1, 'Client a changé d’avis')", [autre.id]);
    await expect(louer(employe, [tente], '2026-11-05', '2026-11-01')).rejects.toThrow(/Dates invalides/);
    await expect(louer(employe, [], '2026-11-10', '2026-11-11')).rejects.toThrow(/au moins un objet/);
  });

  test('objet en maintenance : non louable', async () => {
    const velo = await valeur(gerant, 'select enregistrer_objet_location($1, $2::jsonb)', [etab, json({ nom: 'Vélo', tarif_jour: 2000, etat: 'maintenance' })]);
    await expect(louer(employe, [velo], '2026-12-01', '2026-12-02')).rejects.toThrow(/maintenance/);
  });

  test('remise, acompte, retour en retard, caution retenue, solde', async () => {
    await expect(comme(employe, 'select retourner_contrat_location($1)', [contrat])).rejects.toThrow(/en cours/);
    await comme(employe, 'select remettre_contrat_location($1, true)', [contrat]);
    expect((await contratDe(contrat)).caution_statut).toBe('recue');
    expect(Number(await valeur(employe, "select encaisser_contrat_location($1, 30000, 'especes')", [contrat]))).toBe(50000);
    await expect(comme(employe, "select encaisser_contrat_location($1, 999999, 'especes')", [contrat])).rejects.toThrow(/dépasse/);
    await expect(comme(employe, "select retourner_contrat_location($1, $2::jsonb)", [contrat, json({ date_retour: '2026-11-04', caution: 'retenue', caution_retenue: 10000 })]))
      .rejects.toThrow(/Expliquez/);
    const r = await valeur(employe, 'select retourner_contrat_location($1, $2::jsonb)', [contrat, json({
      date_retour: '2026-11-04', caution: 'retenue', caution_retenue: 10000, etat_retour: 'Toile déchirée', objets_maintenance: [tente],
    })]);
    expect(r).toMatchObject({ jours: 3, montant_final: 120000, reste_a_payer: 90000 });
    expect(await contratDe(contrat)).toMatchObject({ statut: 'rendu', caution_statut: 'retenue', caution_retenue: '10000.00' });
    expect((await db.query('select etat from loc_objets where id = $1', [tente])).rows[0].etat).toBe('maintenance');
    expect(Number(await valeur(employe, "select encaisser_contrat_location($1, 90000, 'mobile_money')", [contrat]))).toBe(0);
  });

  test('isolation, lecture seule, écriture directe refusée', async () => {
    expect(await comme(autreGerant, 'select id from loc_contrats')).toEqual([]);
    expect(await comme(autreGerant, 'select id from loc_objets')).toEqual([]);
    await expect(comme(autreGerant, "select encaisser_contrat_location($1, 1, 'especes')", [contrat])).rejects.toThrow(/Permission refusée/);
    await expect(louer(lecteur, [sono], '2027-01-01', '2027-01-02')).rejects.toThrow(/Permission refusée/);
    expect((await comme(lecteur, 'select id from loc_contrats')).length).toBe(2);
    await expect(comme(gerant, "update loc_contrats set montant_paye = 0 where id = $1", [contrat])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'delete from loc_paiements')).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from loc_paiements')).rejects.toThrow();
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select remettre_contrat_location($1)', [contrat]))).rejects.toThrow(/permission denied/);
  });

  test('tableau de bord Location', async () => {
    expect((await valeur(gerant, 'select cockpit_domaines($1)', [etab])).map((d) => d.id)).toContain('location');
    const c = await valeur(gerant, "select cockpit_location($1, '2026-11-01', '2026-11-30')", [etab]);
    expect(c.kpis.find((k) => k.cle === 'revenus').valeur).toBe(120000);
  });
});
