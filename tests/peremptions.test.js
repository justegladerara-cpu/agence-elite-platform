import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Dates de péremption : noter, voir ce qui périme bientôt, régler (avec ou sans retrait du stock), droits.
let db;
let sa;
let gerant;
let caissier;
let autreGerant;
let etab;
let autreEtab;
let hub;
let yaourt;
let lait;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
// Date en jours depuis aujourd'hui, au fuseau de l'établissement (calculée par la base).
const jour = async (decalage) => (await db.query("select to_char(date_locale($1) + $2::integer, 'YYYY-MM-DD') d", [etab, decalage])).rows[0].d;
const noter = async (user, article, quantite, decalage, h = hub, e = etab) => valeur(user, 'select noter_peremption($1, $2, $3, $4, $5::date, $6)', [e, h, article, quantite, await jour(decalage), null]);
const proches = async (user, jours = 7) => valeur(user, 'select peremptions_proches($1, $2)', [etab, jours]);
const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [hub, article])).rows[0].q);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@per.test');
  gerant = await utilisateur('gerant@per.test');
  caissier = await utilisateur('caisse@per.test');
  autreGerant = await utilisateur('autre@per.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Péremption')", [await valeur(sa, "select creer_client('Client Péremption')")]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre Boutique')", [await valeur(sa, "select creer_client('Autre client')")]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($4, $5, 'gerant')",
    [etab, gerant, caissier, autreEtab, autreGerant],
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [etab])).rows[0].id;
  yaourt = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Yaourt nature', prix_vente: 500, cout_achat: 300, stock_initial: 10 })]);
  lait = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Lait 1 L', prix_vente: 1000, stock_initial: 2 })]);
});

afterAll(async () => db.close());

describe('dates de péremption', () => {
  test('droits : sans stock.ajuster on ne note pas ; un autre établissement non plus', async () => {
    await expect(noter(caissier, yaourt, 2, 3)).rejects.toThrow(/Permission refusée/);
    await expect(noter(autreGerant, yaourt, 2, 3)).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'insert into peremptions(etablissement_id, hub_id, article_id, quantite, date_peremption, cree_par) values($1, $2, $3, 1, current_date, $4)', [etab, hub, yaourt, gerant])).rejects.toThrow();
  });

  test('saisie contrôlée : quantité positive, article de l’établissement', async () => {
    await expect(noter(gerant, yaourt, 0, 3)).rejects.toThrow(/quantité/);
    const etranger = await valeur(autreGerant, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Article ailleurs', prix_vente: 10 })]);
    await expect(noter(gerant, etranger, 1, 3)).rejects.toThrow(/Article introuvable/);
  });

  test('liste des dates proches : déjà périmé et dans N jours, pas au-delà', async () => {
    await noter(gerant, yaourt, 4, -1);
    await noter(gerant, lait, 1, 5);
    await noter(gerant, lait, 1, 30);
    const liste = await proches(gerant);
    expect(liste.map((p) => [p.article, Number(p.quantite), p.jours])).toEqual([['Yaourt nature', 4, -1], ['Lait 1 L', 1, 5]]);
    expect(await proches(caissier)).toHaveLength(2); // le caissier lit le stock
    expect(await proches(gerant, 60)).toHaveLength(3);
    await expect(proches(autreGerant)).rejects.toThrow(/Permission refusée/);
  });

  test('retirer du stock : retrait « Périmé » comme le bouton Retirer, puis c’est réglé', async () => {
    const p = (await proches(gerant)).find((x) => x.article === 'Yaourt nature');
    await expect(valeur(caissier, 'select traiter_peremption($1, true)', [p.id])).rejects.toThrow(/Permission refusée/);
    const r = await valeur(gerant, 'select traiter_peremption($1, true)', [p.id]);
    expect(Number(r.retire)).toBe(4);
    expect(await stock(yaourt)).toBe(6);
    const m = (await db.query("select type, quantite, motif from mouvements_stock where article_id = $1 and motif = 'Périmé'", [yaourt])).rows;
    expect(m.map((x) => [x.type, Number(x.quantite)])).toEqual([['ajustement', -4]]);
    await expect(valeur(gerant, 'select traiter_peremption($1, true)', [p.id])).rejects.toThrow(/déjà réglé/);
    expect((await proches(gerant)).map((x) => x.article)).toEqual(['Lait 1 L']);
  });

  test('c’est réglé sans retrait : le stock ne bouge pas', async () => {
    const [p] = await proches(gerant);
    const avant = await stock(lait);
    expect(Number((await valeur(gerant, 'select traiter_peremption($1, false)', [p.id])).retire)).toBe(0);
    expect(await stock(lait)).toBe(avant);
    expect((await db.query('select statut, traitee_par from peremptions where id = $1', [p.id])).rows[0]).toEqual({ statut: 'traitee', traitee_par: gerant });
  });
});
