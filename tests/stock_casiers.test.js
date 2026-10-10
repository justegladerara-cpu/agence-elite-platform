import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Casiers, cartons, packs : un article déclare son casier ; on reçoit et on compte en casiers + unités,
// le stock reste en unités. Réglage réservé à articles.gerer ; casier donné dans le fichier de stock.
let db;
let sa;
let gerant;
let depotier;
let caissier;
let autreGerant;
let etab;
let autreEtab;
let hub;
let autreHub;
let biere;
let huile;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const saisir = (user, mode, lignes, extra = {}) => valeur(user, 'select saisir_stock($1, $2, $3::jsonb, $4, $5)', [
  extra.hub ?? hub, mode, json(lignes), extra.motif ?? null, extra.simulation ?? false]);
const stock = async (article, h = hub) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [h, article])).rows[0].q);
const article = async (id) => (await db.query('select * from articles where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@cas.test');
  gerant = await utilisateur('gerant@cas.test');
  depotier = await utilisateur('depot@cas.test');
  caissier = await utilisateur('caisse@cas.test');
  autreGerant = await utilisateur('autre@cas.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Casiers')", [await valeur(sa, "select creer_client('Client Casiers')")]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Stock')", [await valeur(sa, "select creer_client('Concurrent')")]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'gestionnaire_depot'), ($1, $4, 'employe'), ($5, $6, 'gerant')`,
    [etab, gerant, depotier, caissier, autreEtab, autreGerant],
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [etab])).rows[0].id;
  autreHub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [autreEtab])).rows[0].id;
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière 33 cl', prix_vente: 1000, stock_initial: 10 })]);
  huile = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Eau 1,5 L', reference: 'EAU-15', prix_vente: 500 })]);
});

afterAll(async () => db.close());

describe('casier d’un article', () => {
  test('réglage par le gérant ; refusé sans le droit articles.gerer ; bornes', async () => {
    await comme(gerant, 'select regler_lot_article($1, 24, $2)', [biere, ' casier ']);
    expect(await article(biere)).toMatchObject({ unites_par_lot: 24, nom_lot: 'casier' });
    await expect(comme(depotier, 'select regler_lot_article($1, 12, null)', [biere])).rejects.toThrow(/permission|droit|autoris/i);
    await expect(comme(autreGerant, 'select regler_lot_article($1, 12, null)', [biere])).rejects.toThrow();
    await expect(comme(gerant, 'select regler_lot_article($1, 1, null)', [biere])).rejects.toThrow(/de 2 à 10 000/);
    await comme(gerant, 'select regler_lot_article($1, null, $2)', [huile, 'pack']);
    expect(await article(huile)).toMatchObject({ unites_par_lot: null, nom_lot: null });
  });
});

describe('saisie en casiers', () => {
  test('réception : 5 casiers de 24 + 3 bouteilles = 123 unités', async () => {
    const r = await saisir(depotier, 'reception', [{ article_id: biere, lots: 5, quantite: 3 }]);
    expect(r.quantite_totale).toBe(123);
    expect(await stock(biere)).toBe(133);
  });

  test('comptage : 2 casiers et 7 bouteilles', async () => {
    await saisir(depotier, 'comptage', [{ article_id: biere, lots: '2', quantite: '7' }]);
    expect(await stock(biere)).toBe(55);
  });

  test('casiers sur un article sans casier : refusé sans par_lot, le gérant le règle par le fichier', async () => {
    await expect(saisir(depotier, 'reception', [{ reference: 'EAU-15', lots: 2 }])).rejects.toThrow(/Ligne 1 : indiquez combien d'unités contient un casier/);
    await saisir(depotier, 'reception', [{ reference: 'EAU-15', lots: 2, par_lot: 6 }]);
    expect(await stock(huile)).toBe(12);
    expect((await article(huile)).unites_par_lot).toBeNull();
    await saisir(gerant, 'reception', [{ reference: 'EAU-15', lots: 1, par_lot: 6 }], { simulation: true });
    expect((await article(huile)).unites_par_lot).toBeNull();
    await saisir(gerant, 'reception', [{ reference: 'EAU-15', lots: 1, par_lot: 6 }]);
    expect((await article(huile)).unites_par_lot).toBe(6);
    expect(await stock(huile)).toBe(18);
  });

  test('nouvel article du fichier avec son casier ; quantités invalides refusées', async () => {
    const r = await saisir(gerant, 'reception', [{ nom: 'Soda 33 cl', prix_vente: 600, lots: 3, par_lot: 12 }]);
    expect(r.nouveaux).toBe(1);
    const soda = (await db.query("select * from articles where etablissement_id = $1 and nom = 'Soda 33 cl'", [etab])).rows[0];
    expect(soda.unites_par_lot).toBe(12);
    expect(await stock(soda.id)).toBe(36);
    await expect(saisir(gerant, 'reception', [{ article_id: biere, lots: -1 }])).rejects.toThrow(/quantité invalide/);
    await expect(saisir(gerant, 'reception', [{ article_id: biere, lots: 0, quantite: 0 }])).rejects.toThrow(/supérieure à 0/);
    await expect(saisir(gerant, 'reception', [{ article_id: biere, lots: 'x' }])).rejects.toThrow(/illisible/);
    await expect(saisir(gerant, 'reception', [{ nom: 'Jus', prix_vente: 1, lots: 1, par_lot: 1 }])).rejects.toThrow(/de 2 à 10 000/);
  });

  test('l’ancienne saisie en unités marche toujours', async () => {
    await saisir(depotier, 'reception', [{ article_id: biere, quantite: 5 }]);
    expect(await stock(biere)).toBe(60);
  });
});
