import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Production (M04, Bêta) : recettes, ordres, consommation et entrée en stock atomiques, droits, isolation, Hubs.
let db;
let sa;
let gerant;
let employe;
let depot;
let autreGerant;
let etab;
let autreEtab;
let farine;
let sucre;
let gateau;
let autreArticle;
let hubPrincipal;
let hubDepot;
let recette;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const stock = async (hub, article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [hub, article])).rows[0].q);
const article = (nom, prix, cout, initial) => valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom, prix_vente: prix, cout_achat: cout, stock_initial: initial })]);
const ordre = (user, quantite, hub = null) => valeur(user, 'select creer_ordre_fabrication($1, $2::jsonb)', [etab, json({ nomenclature_id: recette, quantite, hub_id: hub })]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@pr.test');
  gerant = await utilisateur('gerant@pr.test');
  employe = await utilisateur('employe@pr.test');
  depot = await utilisateur('depot@pr.test');
  autreGerant = await utilisateur('autre@pr.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Boulangerie Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boulangerie Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'gestionnaire_depot'), ($5, $6, 'gerant')`,
    [etab, gerant, employe, depot, autreEtab, autreGerant]
  );
  hubPrincipal = await valeur(gerant, 'select hub_principal($1)', [etab]);
  hubDepot = await valeur(gerant, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Atelier', code: 'AT', type: 'depot' })]);
  await comme(gerant, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, depot, [hubDepot]]);
  farine = await article('Farine 1 kg', 1000, 600, 10);
  sucre = await article('Sucre 1 kg', 900, 500, 10);
  gateau = await article('Gâteau', 5000, null, 0);
  autreArticle = await valeur(autreGerant, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Ailleurs', prix_vente: 10 })]);
});

afterAll(async () => db.close());

describe('production', () => {
  test('sans le module : refusé', async () => {
    await expect(comme(gerant, 'select enregistrer_nomenclature($1, $2::jsonb)', [etab, json({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: farine, quantite: 1 }] })]))
      .rejects.toThrow(/Permission refusée/);
  });

  test('recette : validations et un seul produit par recette', async () => {
    await comme(sa, "select accorder_module($1, 'production', true)", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'production', true)", [etab]);
    const enregistrer = (p, user = gerant) => valeur(user, 'select enregistrer_nomenclature($1, $2::jsonb)', [etab, json(p)]);
    await expect(enregistrer({ article_id: gateau, quantite_produite: 2, composants: [] })).rejects.toThrow(/au moins un composant/);
    await expect(enregistrer({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: gateau, quantite: 1 }] })).rejects.toThrow(/propre composant/);
    await expect(enregistrer({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: autreArticle, quantite: 1 }] })).rejects.toThrow(/Composant introuvable/);
    await expect(enregistrer({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: farine, quantite: 1 }, { article_id: farine, quantite: 2 }] })).rejects.toThrow(/double/);
    await expect(enregistrer({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: farine, quantite: 1 }] }, employe)).rejects.toThrow(/Permission refusée/);
    recette = await enregistrer({ article_id: gateau, quantite_produite: 2, composants: [{ article_id: farine, quantite: 1 }, { article_id: sucre, quantite: 0.5 }] });
    await expect(enregistrer({ article_id: gateau, quantite_produite: 1, composants: [{ article_id: farine, quantite: 1 }] })).rejects.toThrow(/déjà une recette/);
  });

  test('terminer : composants sortis, produit fini entré, coût calculé, en une fois', async () => {
    const o = await ordre(gerant, 4);
    const besoins = await valeur(gerant, 'select besoins_ordre_fabrication($1)', [o]);
    expect(besoins.map((b) => [b.nom, Number(b.besoin)])).toEqual([['Farine 1 kg', 2], ['Sucre 1 kg', 1]]);
    const r = await valeur(gerant, 'select terminer_ordre_fabrication($1, 4)', [o]);
    expect(r).toMatchObject({ numero: 'OF-00001', quantite_produite: 4, cout_total: 1700 });
    expect(await stock(hubPrincipal, farine)).toBe(8);
    expect(await stock(hubPrincipal, sucre)).toBe(9);
    expect(await stock(hubPrincipal, gateau)).toBe(4);
    const { rows } = await db.query('select type, cout_unitaire from mouvements_stock where ordre_fabrication_id = $1 and article_id = $2', [o, gateau]);
    expect(rows).toEqual([{ type: 'production_entree', cout_unitaire: '425.00' }]);
    await expect(comme(gerant, 'select terminer_ordre_fabrication($1)', [o])).rejects.toThrow(/déjà terminé/);
    await expect(comme(gerant, "select annuler_ordre_fabrication($1, 'trop tard')", [o])).rejects.toThrow(/planifié/);
  });

  test('stock insuffisant : refusé et rien ne bouge, sauf si le réglage l’autorise', async () => {
    const o = await ordre(gerant, 40);
    await expect(comme(gerant, 'select terminer_ordre_fabrication($1)', [o])).rejects.toThrow(/Stock insuffisant : Farine 1 kg/);
    expect(await stock(hubPrincipal, farine)).toBe(8);
    expect((await db.query('select statut from prod_ordres where id = $1', [o])).rows[0].statut).toBe('planifie');
    await comme(gerant, "select annuler_ordre_fabrication($1, 'Commande annulée')", [o]);
    await expect(comme(gerant, "select annuler_ordre_fabrication($1, 'deux fois')", [o])).rejects.toThrow(/planifié/);
    await comme(gerant, "select enregistrer_parametres_module($1, 'production', $2::jsonb)", [etab, json({ stock_negatif: true })]);
    const o2 = await ordre(gerant, 20);
    await comme(gerant, 'select terminer_ordre_fabrication($1)', [o2]);
    expect(await stock(hubPrincipal, farine)).toBe(-2);
    await comme(gerant, "select enregistrer_parametres_module($1, 'production', $2::jsonb)", [etab, json({ stock_negatif: false })]);
  });

  test('Hubs : le gestionnaire du dépôt ne fabrique que dans son Hub', async () => {
    await expect(ordre(depot, 1, hubPrincipal)).rejects.toThrow(/Accès refusé à ce Hub/);
    const o = await ordre(depot, 1, hubDepot);
    await expect(comme(depot, 'select terminer_ordre_fabrication($1)', [o])).rejects.toThrow(/Stock insuffisant/);
    const visibles = await comme(depot, 'select hub_id from prod_ordres');
    expect(visibles.every((x) => x.hub_id === hubDepot)).toBe(true);
    await expect(comme(employe, 'select creer_ordre_fabrication($1, $2::jsonb)', [etab, json({ nomenclature_id: recette, quantite: 1 })])).rejects.toThrow(/Permission refusée/);
  });

  test('isolation et écriture directe refusées', async () => {
    expect(await comme(autreGerant, 'select id from prod_ordres')).toEqual([]);
    expect(await comme(autreGerant, 'select id from prod_nomenclatures')).toEqual([]);
    await expect(comme(autreGerant, 'select creer_ordre_fabrication($1, $2::jsonb)', [etab, json({ nomenclature_id: recette, quantite: 1 })])).rejects.toThrow(/Permission refusée/);
    const o = (await db.query("select id from prod_ordres where statut = 'termine' limit 1")).rows[0].id;
    await expect(comme(autreGerant, 'select besoins_ordre_fabrication($1)', [o])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "update prod_ordres set statut = 'planifie' where id = $1", [o])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'delete from prod_nomenclatures')).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select terminer_ordre_fabrication($1)', [o]))).rejects.toThrow(/permission denied/);
  });

  test('tableau de bord Production et assistant', async () => {
    const domaines = await valeur(gerant, 'select cockpit_domaines($1)', [etab]);
    expect(domaines.map((d) => d.id)).toContain('production');
    const auj = new Date().toISOString().slice(0, 10);
    const c = await valeur(gerant, 'select cockpit_production($1, $2::date - 6, $2::date)', [etab, auj]);
    expect(c.kpis.find((k) => k.cle === 'termines').valeur).toBe(2);
    await expect(comme(employe, 'select cockpit_production($1, $2::date, $2::date)', [etab, auj])).rejects.toThrow(/Permission refusée/);
  });
});
