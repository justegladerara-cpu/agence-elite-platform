import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Fidélité : gain automatique sur ventes validées d'un client, retrait à l'annulation, utilisation, ajustement, droits.
let db;
let sa;
let gerant;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let autreClient;
let riz;
let session;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const solde = async (contact) => Number((await db.query('select coalesce(sum(points), 0) s from fidelite_mouvements where contact_id = $1', [contact])).rows[0].s);
const vendre = (contact, quantite = 1) => valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5)', [
  etab, session, json([{ article_id: riz, quantite }]), json([{ mode: 'especes', montant: 4500 * quantite }]), contact,
]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@fi.test');
  gerant = await utilisateur('gerant@fi.test');
  caissier = await utilisateur('caisse@fi.test');
  lecteur = await utilisateur('lecteur@fi.test');
  autreGerant = await utilisateur('autre@fi.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Épicerie Fidèle')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Épicerie Fidèle')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, caissier, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Fidèle', type: 'client' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client ailleurs', type: 'client' })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 5 kg', prix_vente: 4500, cout_achat: 3500, stock_initial: 100 })]);
  session = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('fidélité', () => {
  test('sans le module, aucune vente ne donne de points', async () => {
    await vendre(client);
    expect(await solde(client)).toBe(0);
    await expect(comme(gerant, 'select soldes_fidelite($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('module actif : points par tranche, client anonyme ignoré, annulation reprise', async () => {
    await comme(sa, "select accorder_module($1, 'fidelite', true)", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'fidelite', true)", [etab]);
    const v = await vendre(client, 3); // 13 500 → 13 points (1 point par 1 000)
    expect(await solde(client)).toBe(13);
    await vendre(null, 2);
    expect((await db.query('select count(*)::int n from fidelite_mouvements')).rows[0].n).toBe(1);
    await comme(gerant, "select enregistrer_parametres_module($1, 'fidelite', $2::jsonb)", [etab, json({ tranche: 500, points_par_tranche: 2 })]);
    await vendre(client, 1); // 4 500 → 9 tranches × 2 = 18
    expect(await solde(client)).toBe(31);
    await comme(gerant, "select annuler_vente($1, 'Erreur de caisse')", [v.vente_id]);
    expect(await solde(client)).toBe(18);
    const types = (await db.query("select type, points from fidelite_mouvements where vente_id = $1 order by cree_le, points desc", [v.vente_id])).rows;
    expect(types).toEqual([{ type: 'gain', points: 13 }, { type: 'annulation', points: -13 }]);
  });

  test('utilisation : minimum, solde suffisant, motif, droits', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'fidelite', $2::jsonb)", [etab, json({ tranche: 500, points_par_tranche: 2, minimum_utilisation: 10 })]);
    await expect(comme(caissier, 'select utiliser_points_fidelite($1, $2, 5, $3)', [etab, client, 'Remise'])).rejects.toThrow(/au moins 10/);
    await expect(comme(caissier, 'select utiliser_points_fidelite($1, $2, 50, $3)', [etab, client, 'Remise'])).rejects.toThrow(/Solde insuffisant/);
    await expect(comme(caissier, 'select utiliser_points_fidelite($1, $2, 10, $3)', [etab, client, ' '])).rejects.toThrow(/récompense/);
    await expect(comme(lecteur, 'select utiliser_points_fidelite($1, $2, 10, $3)', [etab, client, 'Remise'])).rejects.toThrow(/Permission refusée/);
    expect(await valeur(caissier, 'select utiliser_points_fidelite($1, $2, 10, $3)', [etab, client, 'Remise de 100 FCFA en caisse'])).toBe(8);
    await expect(comme(caissier, 'select ajuster_points_fidelite($1, $2, 5, $3)', [etab, client, 'Geste'])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select ajuster_points_fidelite($1, $2, -9, $3)', [etab, client, 'Correction'])).rejects.toThrow(/négatif/);
    expect(await valeur(gerant, 'select ajuster_points_fidelite($1, $2, 20, $3)', [etab, client, 'Reprise de la carte papier'])).toBe(28);
  });

  test('isolation, lecture et mouvements définitifs', async () => {
    await expect(comme(gerant, 'select utiliser_points_fidelite($1, $2, 10, $3)', [etab, autreClient, 'X'])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select ajuster_points_fidelite($1, $2, 10, $3)', [etab, client, 'X'])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select * from fidelite_mouvements')).toEqual([]);
    const soldes = await valeur(lecteur, 'select soldes_fidelite($1)', [etab]);
    expect(soldes).toEqual([expect.objectContaining({ nom: 'Mme Fidèle', solde: 28, utilises: 10 })]);
    const tdb = await valeur(lecteur, 'select tableau_de_bord_fidelite($1)', [etab]);
    expect(tdb).toMatchObject({ clients: 1, points_en_cours: 28, utilises_mois: 10 });
    await expect(db.query('update fidelite_mouvements set points = 1000')).rejects.toThrow();
    await expect(db.query('delete from fidelite_mouvements')).rejects.toThrow(/Suppression interdite/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select soldes_fidelite($1)', [etab]))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, "insert into fidelite_mouvements(etablissement_id, contact_id, type, points, motif) values ($1, $2, 'ajustement', 999, 'Fraude')", [etab, client])).rejects.toThrow(/row-level security|permission denied/);
  });

  test('catalogue de récompenses : attribution structurée et liée au mouvement', async () => {
    const recompense = await valeur(gerant, 'select enregistrer_recompense_fidelite($1,$2::jsonb)', [etab, json({ nom: 'Livraison offerte', description: 'Sur la prochaine commande', points: 15, valeur: 1500 })]);
    await expect(comme(caissier, 'select enregistrer_recompense_fidelite($1,$2::jsonb)', [etab, json({ nom: 'Fraude', points: 1 })])).rejects.toThrow(/Permission refusée/);
    const solde = await valeur(caissier, 'select attribuer_recompense_fidelite($1,$2,null,$3)', [recompense, client, 'Commande téléphone']);
    expect(solde).toBe(13);
    const attribution = (await db.query('select a.*,m.points from fidelite_attributions a join fidelite_mouvements m on m.id=a.mouvement_id where a.recompense_id=$1', [recompense])).rows[0];
    expect(attribution.points).toBe(-15);
    await expect(comme(autreGerant, 'select attribuer_recompense_fidelite($1,$2)', [recompense, client])).rejects.toThrow(/Permission refusée/);
    await expect(db.query('delete from fidelite_attributions')).rejects.toThrow(/Suppression interdite/);
  });

  test('module désactivé : les points acquis restent, plus aucun gain', async () => {
    await comme(sa, "select definir_module_etablissement($1, 'fidelite', false)", [etab]);
    await vendre(client);
    expect(await solde(client)).toBe(13);
  });
});
