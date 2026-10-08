import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Modifications groupées d'articles : une seule opération, droits vérifiés, isolation, stock jamais touché.
let db;
let gerant;
let employe;
let autreGerant;
let etab;
let autreEtab;
let a1;
let a2;
let a3;
let etranger;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const lot = (u, e, ids, changements) => valeur(u, 'select modifier_articles_lot($1, $2::uuid[], $3::jsonb)', [e, ids, json(changements)]);
const article = async (id) => (await db.query('select suivi_stock, disponible, epuise, actif, poste_preparation, stock_minimum from articles where id = $1', [id])).rows[0];
const stock = async (id) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [id])).rows[0].q);

beforeAll(async () => {
  db = await creerBase();
  const sa = await utilisateur('sa@lot.test');
  gerant = await utilisateur('gerant@lot.test');
  employe = await utilisateur('employe@lot.test');
  autreGerant = await utilisateur('autre@lot.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Client Lot')");
  const c2 = await valeur(sa, "select creer_client('Client Voisin')");
  etab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Lot Centre')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Lot Voisin')", [c2]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($4, $5, 'gerant')",
    [etab, gerant, employe, autreEtab, autreGerant]);
  const creer = (e, u, nom, extra = {}) => valeur(u, 'select enregistrer_article($1, $2::jsonb)', [e, json({ nom, prix_vente: 1000, ...extra })]);
  a1 = await creer(etab, gerant, 'Bière fictive', { stock_initial: 12 });
  a2 = await creer(etab, gerant, 'Jus fictif', { stock_initial: 5 });
  a3 = await creer(etab, gerant, 'Poulet fictif', { suivi_stock: false });
  etranger = await creer(autreEtab, autreGerant, 'Article voisin');
});

afterAll(async () => db.close());

describe('modifications groupées d’articles', () => {
  test('suivi du stock retiré puis remis en une fois, quantités inchangées', async () => {
    expect(await lot(gerant, etab, [a1, a2], { suivi_stock: false })).toBe(2);
    expect((await article(a1)).suivi_stock).toBe(false);
    expect((await article(a2)).suivi_stock).toBe(false);
    expect(await stock(a1)).toBe(12);
    expect(await lot(gerant, etab, [a1, a2, a3], { suivi_stock: true })).toBe(3);
    expect((await article(a3)).suivi_stock).toBe(true);
    expect(await stock(a2)).toBe(5);
  });

  test('disponibilité, épuisement, poste de préparation, stock minimum, archivage et retour', async () => {
    await lot(gerant, etab, [a1, a2], { disponible: false });
    expect((await article(a1)).disponible).toBe(false);
    await lot(gerant, etab, [a1, a2], { disponible: true, epuise: false });
    await lot(gerant, etab, [a2], { epuise: true });
    expect((await article(a2)).epuise).toBe(true);
    await lot(gerant, etab, [a1, a2], { poste_preparation: 'bar', stock_minimum: 3 });
    expect(await article(a1)).toMatchObject({ poste_preparation: 'bar' });
    expect(Number((await article(a1)).stock_minimum)).toBe(3);
    await lot(gerant, etab, [a3], { actif: false });
    expect((await article(a3)).actif).toBe(false);
    await lot(gerant, etab, [a3], { actif: true });
    expect((await article(a3)).actif).toBe(true);
    const ev = (await db.query("select count(*)::int n from evenements where etablissement_id = $1 and type = 'articles.modification_lot'", [etab])).rows[0].n;
    expect(ev).toBeGreaterThanOrEqual(7);
  });

  test('refus : droits, isolation, clé ou valeur non autorisée, sélection vide ; tout ou rien', async () => {
    await expect(lot(employe, etab, [a1], { suivi_stock: false })).rejects.toThrow(/Permission refusée/);
    await expect(lot(autreGerant, etab, [a1], { suivi_stock: false })).rejects.toThrow(/Permission refusée/);
    await expect(lot(gerant, etab, [a1, etranger], { disponible: false })).rejects.toThrow(/Article inconnu/);
    expect((await article(a1)).disponible).toBe(true);
    await expect(lot(gerant, etab, [a1], { prix_vente: 1 })).rejects.toThrow(/non autorisée/);
    await expect(lot(gerant, etab, [a1], { suivi_stock: 'oui' })).rejects.toThrow(/oui \/ non/);
    await expect(lot(gerant, etab, [a1], { poste_preparation: 'terrasse' })).rejects.toThrow(/Poste/);
    await expect(lot(gerant, etab, [a1], { stock_minimum: -1 })).rejects.toThrow(/minimum/);
    await expect(lot(gerant, etab, [], { suivi_stock: true })).rejects.toThrow(/Aucun article/);
    await expect(lot(gerant, etab, [a1], {})).rejects.toThrow(/Aucune modification/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select modifier_articles_lot($1, $2::uuid[], $3::jsonb)', [etab, [a1], json({ actif: false })])))
      .rejects.toThrow(/permission denied/);
  });
});
