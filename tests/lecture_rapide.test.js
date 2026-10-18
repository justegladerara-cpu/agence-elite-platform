import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { appliquerMigrations, commeRole, creerBase } from './helpers/db.js';

// Lecture rapide (migration 20261018000140) : les politiques de lecture ne changent pas de résultat.
// On construit la base AVANT la migration, on note ce que chaque personne voit, on applique la migration,
// puis chaque personne doit voir exactement les mêmes lignes (ni plus, ni moins).
const MIGRATION = '20261018000140';
const TABLES = ['mouvements_stock', 'ventes', 'paiements', 'lignes_vente', 'articles'];

let db;
const p = {};
const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const vues = async () => {
  const r = {};
  for (const [nom, id] of Object.entries(p)) {
    r[nom] = {};
    for (const t of TABLES) r[nom][t] = (await comme(id, `select id from ${t} order by id`)).map((l) => l.id);
  }
  return r;
};

let avant;

beforeAll(async () => {
  db = await creerBase({ jusqua: MIGRATION });
  const admin = await utilisateur('admin@lecture.test');
  p.patron = await utilisateur('patron@lecture.test');
  p.caissier = await utilisateur('caissier@lecture.test');
  p.restreint = await utilisateur('restreint@lecture.test');
  p.dirigeant = await utilisateur('dirigeant@lecture.test');
  p.autrePatron = await utilisateur('autre@lecture.test');
  p.inconnu = await utilisateur('inconnu@lecture.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Bar Lecture')");
  const autreClient = await valeur(admin, "select creer_client('Concurrent Lecture')");
  const etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Lecture')", [client]);
  const autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Concurrent Lecture')", [autreClient]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'responsable_hub'), ($5, $6, 'gerant')`,
    [etab, p.patron, p.caissier, p.restreint, autreEtab, p.autrePatron]
  );
  await db.query("insert into client_membres(client_id, user_id, role) values($1, $2, 'dirigeant')", [client, p.dirigeant]);
  await db.query("insert into etablissement_parametres(etablissement_id, module_id, data) values ($1, 'cloture', '{\"caisse_unique\": false}')", [etab]);

  const hubA = await valeur(p.patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Salle A', type: 'point_de_vente' })]);
  const hubB = await valeur(p.patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Salle B', type: 'point_de_vente' })]);
  const caisseA = (await db.query('select id from points_de_vente where hub_id = $1', [hubA])).rows[0].id;
  const caisseB = (await db.query('select id from points_de_vente where hub_id = $1', [hubB])).rows[0].id;
  const biere = await valeur(p.patron, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière', prix_vente: 1000, cout_achat: 600 })]);
  for (const hub of [hubA, hubB]) await comme(p.patron, "select ajuster_stock_hub($1, $2, 'entree', 50, 'Réception')", [hub, biere]);
  const autreArticle = await valeur(p.autrePatron, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Jus', prix_vente: 800 })]);
  const autreHub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [autreEtab])).rows[0].id;
  await comme(p.autrePatron, "select ajuster_stock_hub($1, $2, 'entree', 10, 'Réception')", [autreHub, autreArticle]);

  for (const caisse of [caisseA, caisseB]) {
    const session = await valeur(p.patron, 'select ouvrir_caisse($1, $2, 0)', [etab, caisse]);
    await comme(p.patron, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, session, json([{ article_id: biere, quantite: 2 }]), json([{ mode: 'especes', montant: 2000 }])]);
  }
  const autreSession = await valeur(p.autrePatron, 'select ouvrir_caisse($1, null, 0)', [autreEtab]);
  await comme(p.autrePatron, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [autreEtab, autreSession, json([{ article_id: autreArticle, quantite: 1 }]), json([{ mode: 'especes', montant: 800 }])]);
  await comme(p.patron, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, p.restreint, [hubB]]);

  avant = await vues();
  await appliquerMigrations(db, { depuis: MIGRATION });
});

afterAll(async () => db.close());

describe('lecture rapide des grosses tables', () => {
  test('le scénario a bien des lignes à cacher et à montrer', () => {
    expect(avant.patron.ventes.length).toBe(2);
    expect(avant.restreint.ventes.length).toBe(1);
    expect(avant.autrePatron.ventes.length).toBe(1);
    expect(avant.inconnu.mouvements_stock).toEqual([]);
    expect(avant.dirigeant.mouvements_stock.length).toBe(avant.patron.mouvements_stock.length);
  });

  test('chaque personne voit exactement les mêmes lignes après la migration', async () => {
    expect(await vues()).toEqual(avant);
  });

  test('les politiques passent par les listes calculées une fois par requête', async () => {
    const politiques = (await db.query(
      "select tablename, qual from pg_policies where schemaname = 'public' and policyname = 'lecture' and tablename = any($1) order by tablename",
      [TABLES]
    )).rows;
    expect(politiques).toHaveLength(5);
    for (const { qual } of politiques) expect(qual).toMatch(/etablissements_en_lecture/);
    for (const { tablename, qual } of politiques) if (tablename !== 'lignes_vente' && tablename !== 'articles') expect(qual).toMatch(/hubs_en_lecture/);
  });

  test('les nouvelles fonctions ne sont pas ouvertes aux visiteurs anonymes', async () => {
    const droits = (await db.query(
      "select p.proname, has_function_privilege('anon', p.oid, 'execute') anon from pg_proc p where p.proname in ('etablissements_en_lecture', 'etablissements_avec_permission', 'hubs_en_lecture') order by 1"
    )).rows;
    expect(droits).toEqual([
      { proname: 'etablissements_avec_permission', anon: false },
      { proname: 'etablissements_en_lecture', anon: false },
      { proname: 'hubs_en_lecture', anon: false },
    ]);
  });
});
