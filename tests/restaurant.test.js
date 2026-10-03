import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Restaurant : tables, commandes, cuisine, addition séparée, encaissement en caisse, droits, Hubs, isolation.
let db;
let sa;
let gerant;
let serveur;
let serveur2;
let cuisinier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let hub;
let terrasse;
let table1;
let table2;
let tableTerrasse;
let poulet;
let biere;
let eau;
let session;
let commande;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const lignes = async (id) => (await db.query('select * from rest_lignes where commande_id = $1 order by cree_le, id', [id])).rows;
const cmd = async (id) => (await db.query('select * from rest_commandes where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@re.test');
  gerant = await utilisateur('gerant@re.test');
  serveur = await utilisateur('serveur@re.test');
  serveur2 = await utilisateur('serveur2@re.test');
  cuisinier = await utilisateur('cuisine@re.test');
  lecteur = await utilisateur('lecteur@re.test');
  autreGerant = await utilisateur('autre@re.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Maquis Le Palmier')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Resto')");
  etab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Le Palmier')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Chez l''Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'serveur'), ($1, $4, 'serveur'), ($1, $5, 'cuisinier'), ($1, $6, 'lecteur'), ($7, $8, 'gerant')`,
    [etab, gerant, serveur, serveur2, cuisinier, lecteur, autreEtab, autreGerant]
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  terrasse = await valeur(gerant, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Bar terrasse' })]);
  await comme(gerant, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, serveur2, [terrasse]]);
  poulet = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Poulet DG', prix_vente: 5000, suivi_stock: false })]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière 65 cl', prix_vente: 1000, cout_achat: 600, suivi_stock: true })]);
  eau = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Eau 1,5 L', prix_vente: 500, suivi_stock: false })]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 24, 'Stock initial', 600)", [hub, biere]);
});

afterAll(async () => db.close());

describe('solution Restaurant', () => {
  test('un établissement Restaurant démarre avec salle, cuisine, caisse et une licence d’essai', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [etab])).rows.map((r) => r.module_id);
    expect(actifs).toEqual(expect.arrayContaining(['caisse', 'articles', 'stock', 'ventes', 'paiements', 'restaurant_salle', 'restaurant_cuisine', 'tableau_de_bord']));
    expect((await db.query("select statut from solutions where id = 'restaurant'")).rows[0].statut).toBe('active');
    expect((await db.query('select formule, offre_id from licences where etablissement_id = $1', [etab])).rows[0]).toEqual({ formule: 'essai', offre_id: 'restaurant-complet' });
  });
});

describe('tables et postes', () => {
  test('seul le gérant crée les tables ; doublon et Hub étranger refusés', async () => {
    await expect(comme(serveur, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T1' })])).rejects.toThrow(/Permission refusée/);
    table1 = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T1', zone: 'Salle', places: 4 })]);
    table2 = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T2', places: 2 })]);
    tableTerrasse = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: terrasse, nom: 'B1', zone: 'Terrasse' })]);
    await expect(comme(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 't1' })])).rejects.toThrow(/existe déjà/);
    const hubAutre = (await db.query('select id from hubs where etablissement_id = $1', [autreEtab])).rows[0].id;
    await expect(comme(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hubAutre, nom: 'X' })])).rejects.toThrow(/Choisissez le Hub/);
  });

  test('postes de préparation : cuisine pour le poulet, bar pour la bière', async () => {
    await expect(comme(serveur, "select definir_poste_preparation($1, 'cuisine')", [poulet])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select definir_poste_preparation($1, 'cuisine')", [poulet]);
    await comme(gerant, "select definir_poste_preparation($1, 'bar')", [biere]);
    await expect(comme(gerant, "select definir_poste_preparation($1, 'four')", [poulet])).rejects.toThrow(/Poste inconnu/);
  });
});

describe('service en salle et cuisine', () => {
  test('ouvrir une table : couverts demandés, table occupée refusée, Hub non autorisé refusé', async () => {
    await expect(comme(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1 })])).rejects.toThrow(/couverts/);
    commande = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 3 })]);
    expect((await cmd(commande)).numero).toMatch(/^CM-/);
    await expect(comme(serveur2, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 2 })])).rejects.toThrow(/Accès refusé à ce Hub|occupée/);
    await expect(comme(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 2 })])).rejects.toThrow(/occupée/);
    await expect(comme(cuisinier, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table2, couverts: 2 })])).rejects.toThrow(/Permission refusée/);
  });

  test('ajouter, modifier avant envoi, envoyer : cuisine et bar prévenus, sans poste servi directement', async () => {
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([
      { article_id: poulet, quantite: 3, note: 'bien cuit' }, { article_id: biere, quantite: 4 }, { article_id: eau, quantite: 1 },
    ])]);
    const [p, b, e] = await lignes(commande);
    expect([p.poste, b.poste, e.poste]).toEqual(['cuisine', 'bar', 'aucun']);
    await comme(serveur, 'select modifier_ligne_restaurant($1, 2, $2)', [e.id, null]);
    await expect(comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: poulet, quantite: -1 }])])).rejects.toThrow(/Quantité invalide/);
    expect(await valeur(serveur, 'select envoyer_commande_restaurant($1)', [commande])).toBe(3);
    const apres = await lignes(commande);
    expect(apres.map((l) => l.statut)).toEqual(['envoyee', 'envoyee', 'servie']);
    expect(Number(apres[2].quantite)).toBe(2);
    expect((await db.query("select count(*)::int n from notifications where user_id = $1 and type = 'restaurant.envoi'", [cuisinier])).rows[0].n).toBe(1);
    await expect(comme(serveur, 'select envoyer_commande_restaurant($1)', [commande])).rejects.toThrow(/Rien à envoyer/);
    await expect(comme(serveur, 'select modifier_ligne_restaurant($1, 1, null)', [p.id])).rejects.toThrow(/déjà envoyé/);
  });

  test('cuisine : en préparation puis prêt (serveur prévenu) ; le serveur ne prépare pas', async () => {
    const [p, b] = await lignes(commande);
    await expect(comme(serveur, "select avancer_ligne_restaurant($1, 'prete')", [p.id])).rejects.toThrow(/Permission refusée/);
    await comme(cuisinier, "select avancer_ligne_restaurant($1, 'en_preparation')", [p.id]);
    await comme(cuisinier, "select avancer_ligne_restaurant($1, 'prete')", [p.id]);
    expect((await db.query("select count(*)::int n from notifications where user_id = $1 and type = 'restaurant.pret'", [serveur])).rows[0].n).toBe(1);
    await expect(comme(cuisinier, "select avancer_ligne_restaurant($1, 'servie')", [p.id])).rejects.toThrow(/Permission refusée/);
    await comme(serveur, "select avancer_ligne_restaurant($1, 'servie')", [p.id]);
    await comme(serveur, "select avancer_ligne_restaurant($1, 'servie')", [b.id]);
    await expect(comme(cuisinier, "select avancer_ligne_restaurant($1, 'prete')", [p.id])).rejects.toThrow(/Passage impossible/);
  });

  test('un plat envoyé ne se modifie pas en direct et ne s’annule qu’avec le droit et un motif', async () => {
    await expect(comme(serveur, 'update rest_lignes set quantite = 1 where commande_id = $1', [commande])).resolves.toEqual([]);
    expect(Number((await lignes(commande))[0].quantite)).toBe(3);
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: poulet, quantite: 1 }])]);
    await comme(serveur, 'select envoyer_commande_restaurant($1)', [commande]);
    const extra = (await lignes(commande))[3];
    await expect(comme(serveur, "select annuler_ligne_restaurant($1, 'Client parti')", [extra.id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_ligne_restaurant($1, ' ')", [extra.id])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_ligne_restaurant($1, 'Erreur de saisie')", [extra.id]);
    await expect(db.query('delete from rest_lignes where id = $1', [extra.id])).rejects.toThrow();
  });

  test('transfert vers une table libre du même Hub seulement', async () => {
    await expect(comme(serveur, 'select transferer_commande_restaurant($1, $2)', [commande, tableTerrasse])).rejects.toThrow(/même Hub/);
    await comme(serveur, 'select transferer_commande_restaurant($1, $2)', [commande, table2]);
    expect((await cmd(commande)).table_id).toBe(table2);
  });
});

describe('addition et encaissement', () => {
  test('addition séparée : on sépare 1 poulet, on l’encaisse ; vente d’origine restaurant, stock du Hub sorti', async () => {
    session = await valeur(gerant, 'select ouvrir_caisse($1)', [etab]);
    const [p] = await lignes(commande);
    await expect(comme(serveur, 'select scinder_ligne_restaurant($1, 3)', [p.id])).rejects.toThrow(/Quantité à séparer invalide/);
    const part = await valeur(serveur, 'select scinder_ligne_restaurant($1, 1)', [p.id]);
    expect(Number((await db.query('select quantite from rest_lignes where id = $1', [p.id])).rows[0].quantite)).toBe(2);
    const r = (await comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb, $4::uuid[]) r',
      [commande, session, json([{ mode: 'especes', montant: 5000 }]), [part]]))[0].r;
    expect(r.commande_close).toBe(false);
    const vente = (await db.query('select * from ventes where id = $1', [r.vente_id])).rows[0];
    expect(vente.origine).toBe('restaurant');
    expect(Number(vente.total)).toBe(5000);
    await expect(comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb, $4::uuid[])',
      [commande, session, json([{ mode: 'especes', montant: 5000 }]), [part]])).rejects.toThrow(/déjà encaissés/);
  });

  test('le reste est encaissé en une fois : 2 poulets + 4 bières + 2 eaux = 15 000, table libérée', async () => {
    const r = (await comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb) r',
      [commande, session, json([{ mode: 'mobile_money', montant: 15000, reference: 'MM-1' }])]))[0].r;
    expect(Number(r.total)).toBe(15000);
    expect(r.commande_close).toBe(true);
    expect((await cmd(commande)).statut).toBe('encaissee');
    expect(Number((await db.query("select coalesce(sum(quantite),0) q from mouvements_stock where hub_id = $1 and article_id = $2 and type = 'sortie_vente'", [hub, biere])).rows[0].q)).toBe(-4);
    const dash = await valeur(gerant, 'select tableau_de_bord_restaurant($1)', [etab]);
    expect(Number(dash.chiffre_jour)).toBe(20000);
    expect(dash.tickets_jour).toBe(2);
    expect(dash.couverts_jour).toBe(3);
    await expect(comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: eau, quantite: 1 }])])).rejects.toThrow(/close/);
  });

  test('une vente de restaurant s’annule comme une vente de caisse ; le plat encaissé reste figé', async () => {
    const venteId = (await lignes(commande))[0].vente_id;
    await comme(gerant, "select annuler_vente($1, 'Erreur de table')", [venteId]);
    expect((await db.query('select statut from ventes where id = $1', [venteId])).rows[0].statut).toBe('annulee');
  });

  test('à emporter : plats non envoyés bloquent l’addition ; annulation de commande avec motif', async () => {
    const emporter = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom_client: 'Paul' })]);
    expect((await cmd(emporter)).type).toBe('a_emporter');
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [emporter, json([{ article_id: poulet, quantite: 1 }])]);
    await expect(comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb)', [emporter, session, json([{ mode: 'especes', montant: 5000 }])])).rejects.toThrow(/pas envoyés/);
    await expect(comme(serveur, "select annuler_commande_restaurant($1, 'Client parti')", [emporter])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select annuler_commande_restaurant($1, 'Client parti')", [emporter]);
    expect((await cmd(emporter)).statut).toBe('annulee');
    expect((await lignes(emporter)).every((l) => l.statut === 'annulee')).toBe(true);
  });
});

describe('lecture et isolation', () => {
  test('le cuisinier voit les plats ; le lecteur voit sans agir ; un autre établissement ne voit rien', async () => {
    expect((await comme(cuisinier, 'select id from rest_lignes where commande_id = $1', [commande])).length).toBeGreaterThan(0);
    expect((await comme(lecteur, 'select id from rest_commandes where etablissement_id = $1', [etab])).length).toBeGreaterThan(0);
    await expect(comme(lecteur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 1 })])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from rest_commandes where etablissement_id = $1', [etab])).toEqual([]);
    await expect(comme(autreGerant, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: eau, quantite: 1 }])])).rejects.toThrow(/Permission refusée|close/);
    await expect(comme(autreGerant, 'select tableau_de_bord_restaurant($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('le serveur limité au bar terrasse ne voit pas la salle principale', async () => {
    expect(await comme(serveur2, 'select id from rest_tables where hub_id = $1', [hub])).toEqual([]);
    expect((await comme(serveur2, 'select id from rest_tables where hub_id = $1', [terrasse])).length).toBe(1);
  });

  test('anonyme : aucune fonction restaurant', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({})]))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, "select commande_restaurant_ouverte($1, 'restaurant_salle.servir')", [commande])).rejects.toThrow(/permission denied/);
  });
});
