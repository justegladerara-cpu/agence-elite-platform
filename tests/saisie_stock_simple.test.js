import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Stock simplifié : « J'ai reçu de la marchandise » et « Je compte mon stock » sur plusieurs articles à la fois,
// fichier de stock (nouveaux articles, catégorie facultative), suivi activé tout seul, aperçu sans écriture, droits.
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
let riz;
let huile;
let sac;

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
  sa = await utilisateur('sa@st.test');
  gerant = await utilisateur('gerant@st.test');
  depotier = await utilisateur('depot@st.test');
  caissier = await utilisateur('caisse@st.test');
  autreGerant = await utilisateur('autre@st.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Stock')", [await valeur(sa, "select creer_client('Client Stock')")]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Stock')", [await valeur(sa, "select creer_client('Concurrent')")]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'gestionnaire_depot'), ($1, $4, 'employe'), ($5, $6, 'gerant')`,
    [etab, gerant, depotier, caissier, autreEtab, autreGerant],
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [etab])).rows[0].id;
  autreHub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [autreEtab])).rows[0].id;
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz parfumé 5 kg', prix_vente: 5000, stock_initial: 10 })]);
  huile = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Huile 1 L', reference: 'HUI-1', prix_vente: 1500 })]);
  sac = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Sac cabas', prix_vente: 200, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('j’ai reçu de la marchandise', () => {
  test('plusieurs articles en une fois ; le suivi s’active tout seul ; motif par défaut', async () => {
    expect((await article(sac)).suivi_stock).toBe(false);
    const r = await saisir(depotier, 'reception', [{ article_id: riz, quantite: 5 }, { reference: 'HUI-1', quantite: '12' }, { nom: 'sac CABAS', quantite: '3,5' }]);
    expect(r).toMatchObject({ articles: 3, nouveaux: 0, suivi_active: 1 });
    expect(await stock(riz)).toBe(15);
    expect(await stock(huile)).toBe(12);
    expect(await stock(sac)).toBe(3.5);
    expect((await article(sac)).suivi_stock).toBe(true);
    const motifs = (await db.query("select distinct motif from mouvements_stock where type = 'entree' and article_id = $1", [huile])).rows;
    expect(motifs).toEqual([{ motif: 'Marchandise reçue' }]);
  });

  test('une ligne fausse refuse tout, avec son numéro ; quantité nulle, doublon, article étranger', async () => {
    const avant = await stock(riz);
    await expect(saisir(gerant, 'reception', [{ article_id: riz, quantite: 1 }, { article_id: huile, quantite: 0 }])).rejects.toThrow(/Ligne 2/);
    await expect(saisir(gerant, 'reception', [{ article_id: riz, quantite: 1 }, { nom: 'riz parfume 5 kg', quantite: 1 }])).rejects.toThrow(/deux fois/);
    await expect(saisir(gerant, 'reception', [{ article_id: riz, quantite: 'beaucoup' }])).rejects.toThrow(/illisible/);
    await expect(saisir(autreGerant, 'reception', [{ article_id: riz, quantite: 1 }], { hub: autreHub })).rejects.toThrow(/inconnu/);
    expect(await stock(riz)).toBe(avant);
  });

  test('droits : le caissier ne saisit pas le stock ; un autre établissement non plus', async () => {
    await expect(saisir(caissier, 'reception', [{ article_id: riz, quantite: 1 }])).rejects.toThrow(/Permission refusée/);
    await expect(saisir(autreGerant, 'reception', [{ article_id: riz, quantite: 1 }])).rejects.toThrow(/Permission refusée/);
  });
});

describe('je compte mon stock', () => {
  test('la quantité comptée devient le stock ; l’écart est tracé dans un inventaire', async () => {
    const r = await saisir(depotier, 'comptage', [{ article_id: riz, quantite: 9 }, { article_id: huile, quantite: 12 }]);
    expect(r.inventaire).toMatchObject({ articles: 2, ecarts: 1 });
    expect(await stock(riz)).toBe(9);
    expect(await stock(huile)).toBe(12);
    expect((await db.query('select motif from inventaires where id = $1', [r.inventaire.inventaire_id])).rows[0].motif).toBe('Stock compté');
  });
});

describe('fichier de stock', () => {
  test('aperçu sans écriture : existants, nouveaux, catégorie à créer', async () => {
    const lignes = [
      { nom: 'Huile 1 L', quantite: 20 },
      { nom: 'Savon de Marseille', categorie: 'Hygiène', prix_vente: '750', quantite: 30 },
      { nom: 'Bougie', prix_vente: 100, quantite: 0 },
    ];
    const apercu = await saisir(gerant, 'comptage', lignes, { simulation: true });
    expect(apercu).toMatchObject({ simulation: true, articles: 3, nouveaux: 2 });
    expect(apercu.details.map((d) => [d.nom, d.action, Number(d.apres)])).toEqual([['Huile 1 L', 'existant', 20], ['Savon de Marseille', 'nouveau', 30], ['Bougie', 'nouveau', 0]]);
    expect((await db.query("select count(*)::int n from articles where nom = 'Savon de Marseille'")).rows[0].n).toBe(0);
    expect(await stock(huile)).toBe(12);
  });

  test('les nouveaux articles sont créés (catégorie créée ou reprise) puis comptés ; prix exigé ; droit articles requis', async () => {
    await expect(saisir(gerant, 'comptage', [{ nom: 'Article sans prix', quantite: 2 }])).rejects.toThrow(/prix de vente manquant/);
    await expect(saisir(depotier, 'comptage', [{ nom: 'Nouveau du dépôt', prix_vente: 10, quantite: 2 }])).rejects.toThrow(/Permission refusée/);
    await saisir(gerant, 'comptage', [
      { nom: 'Huile 1 L', quantite: 20 },
      { nom: 'Savon de Marseille', categorie: 'Hygiène', prix_vente: '750', quantite: 30 },
      { nom: 'Dentifrice', categorie: 'hygiene', prix_vente: 900, quantite: 4 },
    ]);
    const savon = (await db.query("select a.*, c.nom categorie from articles a join categories_articles c on c.id = a.categorie_id where a.nom = 'Savon de Marseille'")).rows[0];
    expect(savon).toMatchObject({ categorie: 'Hygiène', suivi_stock: true });
    expect(Number(savon.prix_vente)).toBe(750);
    expect(await stock(savon.id)).toBe(30);
    expect((await db.query("select count(*)::int n from categories_articles where etablissement_id = $1 and nom ilike 'hyg%'", [etab])).rows[0].n).toBe(1);
    expect(await stock(huile)).toBe(20);
  });

  test('deux articles du même nom : la référence est demandée', async () => {
    await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Savon de Marseille', reference: 'SAV-2', prix_vente: 800 })]);
    await expect(saisir(gerant, 'reception', [{ nom: 'Savon de Marseille', quantite: 1 }])).rejects.toThrow(/ajoutez la référence/);
    await saisir(gerant, 'reception', [{ nom: 'Savon de Marseille', reference: 'SAV-2', quantite: 1 }]);
  });
});
