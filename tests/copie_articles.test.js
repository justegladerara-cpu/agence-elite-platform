import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Super admin : copier des articles d'un client vers un autre, bibliothèque Agence Elite (migration 20261017000134).
let db;
let superAdmin;
let admin;
let gerant;
let bar;
let hotel;
let demo;
let biere;
let jus;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const copier = (u, source, cible, ids, mode, pct, simulation) =>
  valeur(u, 'select copier_articles($1, $2, $3, $4, $5, $6)', [source, cible, ids, mode, pct, simulation]);
const articlesDe = async (etab) => (await db.query(
  'select a.nom, a.prix_vente::float prix, a.cout_achat, a.actif, a.photo, c.nom categorie from articles a left join categories_articles c on c.id = a.categorie_id where a.etablissement_id = $1 order by a.nom',
  [etab])).rows;

beforeAll(async () => {
  db = await creerBase();
  superAdmin = await utilisateur('sa@copie.test');
  admin = await utilisateur('admin@copie.test');
  gerant = await utilisateur('gerant@copie.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin'), ($2, 'admin')", [superAdmin, admin]);
  const clientBar = await valeur(superAdmin, "select creer_client('Bar Copie')");
  const clientHotel = await valeur(superAdmin, "select creer_client('Hôtel Copie')");
  const clientDemo = await valeur(superAdmin, "select creer_client('Commerce Démo Copie')");
  bar = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Bar Copie')", [clientBar]);
  hotel = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Hôtel Copie')", [clientHotel]);
  demo = await valeur(superAdmin, "select creer_etablissement($1, 'commerce', 'Démo Copie')", [clientDemo]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant')", [bar, gerant]);
  const cat = (await db.query("insert into categories_articles(etablissement_id, nom) values ($1, 'Bières') returning id", [bar])).rows[0].id;
  biere = (await db.query(`insert into articles(etablissement_id, nom, variante, categorie_id, prix_vente, cout_achat, photo, code_barres)
    values ($1, 'Primus', '65 cl', $2, 1500, 900, 'data:image/png;base64,AAAA', '6001234') returning id`, [bar, cat])).rows[0].id;
  jus = (await db.query("insert into articles(etablissement_id, nom, prix_vente, cout_achat) values ($1, 'Jus maison', 1000, 300) returning id", [bar])).rows[0].id;
  // L'hôtel a déjà sa Primus (même code-barres).
  await db.query("insert into articles(etablissement_id, nom, prix_vente, code_barres) values ($1, 'PRIMUS GM', 2000, '6001234')", [hotel]);
}, 60000);

afterAll(async () => db?.close());

describe('copier des articles entre clients', () => {
  test('réservé au super admin : ni un admin, ni un gérant', async () => {
    await expect(copier(admin, bar, hotel, null, 'identique', 0, true)).rejects.toThrow(/super administrateur/);
    await expect(copier(gerant, bar, hotel, null, 'identique', 0, true)).rejects.toThrow(/super administrateur/);
    await expect(valeur(gerant, 'select articles_a_copier($1)', [bar])).rejects.toThrow(/super administrateur/);
  });

  test('la liste des articles à copier ne montre jamais le coût d’achat', async () => {
    const liste = await valeur(superAdmin, 'select articles_a_copier($1)', [bar]);
    expect(liste.map((a) => a.nom)).toEqual(['Primus', 'Jus maison']);
    // Valeur 900 seulement (pas un morceau d'identifiant aléatoire, qui peut contenir « 900 »).
    expect(JSON.stringify(liste)).not.toMatch(/cout_achat|:900[,}]/);
  });

  test('aperçu d’abord : rien n’est écrit ; un article déjà présent (même code-barres) est ignoré', async () => {
    const r = await copier(superAdmin, bar, hotel, null, 'identique', 0, true);
    expect(r).toMatchObject({ simulation: true, articles_crees: 1, articles_deja_presents: 1, categories_creees: 0 });
    expect((await articlesDe(hotel)).length).toBe(1);
  });

  test('copie avec prix +10 % : photo et catégorie copiées, coût d’achat jamais', async () => {
    const r = await copier(superAdmin, bar, hotel, [jus], 'pourcentage', 10, false);
    expect(r.articles_crees).toBe(1);
    const jusHotel = (await articlesDe(hotel)).find((a) => a.nom === 'Jus maison');
    expect(jusHotel).toMatchObject({ prix: 1100, cout_achat: null, actif: true });
    const copie = (await db.query('select fait_par, mode_prix from copies_articles where id = $1', [r.copie_id])).rows[0];
    expect(copie).toEqual({ fait_par: superAdmin, mode_prix: 'pourcentage' });
  });

  test('prix à saisir : article inactif, puis actif une fois son prix mis ; annuler désactive sans effacer', async () => {
    const autre = await valeur(superAdmin, "select creer_etablissement((select client_id from etablissements where id = $1), 'commerce', 'Hôtel Copie 2')", [hotel]);
    const r = await copier(superAdmin, bar, autre, [biere], 'a_saisir', 0, false);
    let primus = (await articlesDe(autre)).find((a) => a.nom === 'Primus');
    expect(primus).toMatchObject({ prix: 0, actif: false, categorie: 'Bières', photo: 'data:image/png;base64,AAAA', cout_achat: null });
    const id = (await db.query("select id from articles where etablissement_id = $1 and nom = 'Primus'", [autre])).rows[0].id;
    expect(await valeur(superAdmin, 'select fixer_prix_copie($1, $2)', [r.copie_id, JSON.stringify({ [id]: 1800 })])).toBe(1);
    primus = (await articlesDe(autre)).find((a) => a.nom === 'Primus');
    expect(primus).toMatchObject({ prix: 1800, actif: true });
    await expect(valeur(superAdmin, 'select fixer_prix_copie($1, $2)', [r.copie_id, JSON.stringify({ [jus]: 5 })])).rejects.toThrow(/hors de cette copie/);
    expect(await valeur(superAdmin, 'select annuler_copie_articles($1)', [r.copie_id])).toBe(1);
    expect((await articlesDe(autre)).find((a) => a.nom === 'Primus').actif).toBe(false);
    await expect(valeur(superAdmin, 'select annuler_copie_articles($1)', [r.copie_id])).rejects.toThrow(/déjà annulée/);
  });

  test('démonstration et vrais clients ne se mélangent pas', async () => {
    await expect(copier(superAdmin, bar, demo, null, 'identique', 0, true)).rejects.toThrow(/Démonstration/);
    await expect(copier(superAdmin, demo, hotel, null, 'identique', 0, true)).rejects.toThrow(/Démonstration/);
  });
});

describe('bibliothèque Agence Elite', () => {
  test('ranger des articles (sans prix ni coût), pas de doublon, puis les copier avec prix à saisir', async () => {
    expect(await valeur(superAdmin, 'select ajouter_a_bibliotheque($1)', [[biere, jus]])).toBe(2);
    expect(await valeur(superAdmin, 'select ajouter_a_bibliotheque($1)', [[biere]])).toBe(0);
    const biblio = await valeur(superAdmin, 'select articles_a_copier(null)');
    expect(biblio.map((a) => a.nom).sort()).toEqual(['Jus maison', 'Primus']);
    expect(biblio.every((a) => a.prix_vente === null)).toBe(true);
    const nouveau = await valeur(superAdmin, "select creer_etablissement((select client_id from etablissements where id = $1), 'commerce', 'Bar Neuf')", [hotel]);
    const r = await copier(superAdmin, null, nouveau, null, 'identique', 0, false);
    expect(r).toMatchObject({ mode_prix: 'a_saisir', articles_crees: 2, source: 'Bibliothèque Agence Elite' });
    expect((await articlesDe(nouveau)).every((a) => !a.actif && a.prix === 0)).toBe(true);
  });

  test('la bibliothèque n’est lisible que par Agence Elite ; retirer désactive', async () => {
    expect((await comme(gerant, 'select * from bibliotheque_articles')).length).toBe(0);
    const id = (await db.query("select id from bibliotheque_articles where nom = 'Jus maison'")).rows[0].id;
    await comme(superAdmin, 'select retirer_de_bibliotheque($1)', [id]);
    expect((await valeur(superAdmin, 'select articles_a_copier(null)')).map((a) => a.nom)).toEqual(['Primus']);
  });
});

describe('articles d’une copie', () => {
  test('liste des articles créés, réservée au super admin', async () => {
    const c = (await db.query('select id from copies_articles order by fait_le desc limit 1')).rows[0].id;
    const liste = await valeur(superAdmin, 'select articles_de_copie($1)', [c]);
    expect(liste.length).toBe(2);
    await expect(valeur(gerant, 'select articles_de_copie($1)', [c])).rejects.toThrow(/super administrateur/);
  });
});
