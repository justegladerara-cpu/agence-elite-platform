import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Audit offensif du moteur Commerce et du socle : chaque test joue une attaque
// et vérifie qu'elle est refusée sans laisser de trace incohérente.
let db;
let admin;
let gerantA;
let caissierA;
let inactif;
let restreint;
let gerantB;
let clientB;
let etabA;
let etabB;
let stylo;
let service;
let contactA;
let sessionA;
let categorieB;
let articleB;
let contactB;
let sessionB;
let pdvB;
let venteB;
let paiementB;
let depenseB;

const TABLES_COMMERCE = [
  'categories_articles', 'articles', 'contacts', 'sessions_caisse', 'ventes', 'lignes_vente',
  'paiements', 'mouvements_stock', 'depenses', 'clotures',
];

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const nombre = async (sql, params = []) => Number(Object.values((await db.query(sql, params)).rows[0])[0]);
const stock = (article) => nombre('select coalesce(sum(quantite), 0) from mouvements_stock where article_id = $1', [article]);
const vendre = (user, etab, session, lignes, paiements = [], contact = null, remise = 0) => comme(
  user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5, $6) v',
  [etab, session, lignes === null ? null : JSON.stringify(lignes), JSON.stringify(paiements), contact, remise],
);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@audit.test');
  gerantA = await utilisateur('gerant-a@audit.test');
  caissierA = await utilisateur('caissier-a@audit.test');
  inactif = await utilisateur('inactif@audit.test');
  restreint = await utilisateur('restreint@audit.test');
  gerantB = await utilisateur('gerant-b@audit.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const clientA = await valeur(admin, "select creer_client('Client A')");
  clientB = await valeur(admin, "select creer_client('Client B')");
  etabA = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique A')", [clientA]);
  etabB = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique B')", [clientB]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id, actif, permissions_ajustees) values
     ($1, $2, 'gerant', true, '{}'), ($1, $3, 'employe', true, '{}'), ($1, $4, 'employe', false, '{}'),
     ($1, $5, 'employe', true, '{"caisse.utiliser": false}'), ($6, $7, 'gerant', true, '{}')`,
    [etabA, gerantA, caissierA, inactif, restreint, etabB, gerantB],
  );

  stylo = await valeur(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, '{"nom":"Stylo","prix_vente":500,"cout_achat":200,"stock_initial":10}']);
  service = await valeur(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, '{"nom":"Photocopie","prix_vente":100,"suivi_stock":false}']);
  contactA = await valeur(gerantA, 'select enregistrer_contact($1, $2::jsonb)', [etabA, '{"nom":"Acheteur A"}']);
  sessionA = await valeur(caissierA, 'select ouvrir_caisse($1)', [etabA]);

  categorieB = await valeur(gerantB, "select enregistrer_categorie($1, 'Catégorie B')", [etabB]);
  articleB = await valeur(gerantB, 'select enregistrer_article($1, $2::jsonb)', [etabB, '{"nom":"Article B","prix_vente":1000,"stock_initial":5}']);
  contactB = await valeur(gerantB, 'select enregistrer_contact($1, $2::jsonb)', [etabB, '{"nom":"Fournisseur B","type":"fournisseur"}']);
  sessionB = await valeur(gerantB, 'select ouvrir_caisse($1)', [etabB]);
  pdvB = (await db.query('select point_de_vente_id from sessions_caisse where id = $1', [sessionB])).rows[0].point_de_vente_id;
  venteB = (await vendre(gerantB, etabB, sessionB, [{ article_id: articleB, quantite: 1 }], [{ mode: 'especes', montant: 1000 }]))[0].v.vente_id;
  paiementB = (await db.query('select id from paiements where vente_id = $1', [venteB])).rows[0].id;
  depenseB = await valeur(gerantB, 'select enregistrer_depense($1, $2::jsonb)', [etabB, '{"libelle":"Loyer B","montant":5000,"mode":"virement"}']);
}, 60000);

afterAll(async () => db.close());

describe('références croisées entre établissements', () => {
  test('une vente de A refuse un article, une caisse ou un contact de B', async () => {
    const avant = await nombre('select count(*) from ventes');
    await expect(vendre(gerantA, etabA, sessionA, [{ article_id: articleB, quantite: 1 }], [{ mode: 'especes', montant: 1000 }])).rejects.toThrow(/Article inconnu/);
    await expect(vendre(gerantA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }, { article_id: articleB, quantite: 1 }], [{ mode: 'especes', montant: 2000 }])).rejects.toThrow(/Article inconnu/);
    await expect(vendre(gerantA, etabA, sessionB, [{ article_id: stylo, quantite: 1 }], [{ mode: 'especes', montant: 500 }])).rejects.toThrow(/Aucune caisse ouverte/);
    await expect(vendre(gerantA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }], [], contactB)).rejects.toThrow(/Contact inconnu/);
    await expect(vendre(gerantA, etabB, sessionB, [{ article_id: articleB, quantite: 1 }], [{ mode: 'especes', montant: 1000 }])).rejects.toThrow(/Permission refusée/);
    expect(await nombre('select count(*) from ventes')).toBe(avant);
    expect(await stock(articleB)).toBe(4);
  });

  test('caisse, point de vente, catégorie, article et contact de B sont introuvables depuis A', async () => {
    await expect(comme(gerantA, 'select ouvrir_caisse($1, $2)', [etabA, pdvB])).rejects.toThrow(/Point de vente introuvable/);
    await expect(comme(gerantA, "select enregistrer_point_de_vente($1, 'Volée', $2)", [etabA, pdvB])).rejects.toThrow(/introuvable/);
    await expect(comme(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, JSON.stringify({ nom: 'X', prix_vente: 1, categorie_id: categorieB })])).rejects.toThrow(/Catégorie inconnue/);
    await expect(comme(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, JSON.stringify({ id: articleB, nom: 'Piraté', prix_vente: 0 })])).rejects.toThrow(/introuvable/);
    await expect(comme(gerantA, "select ajuster_stock($1, $2, 'entree', 100)", [etabA, articleB])).rejects.toThrow(/introuvable/);
    await expect(comme(gerantA, 'select enregistrer_contact($1, $2::jsonb)', [etabA, JSON.stringify({ id: contactB, nom: 'Piraté' })])).rejects.toThrow(/introuvable/);
    const article = (await db.query('select nom, prix_vente::float p from articles where id = $1', [articleB])).rows[0];
    expect(article).toEqual({ nom: 'Article B', p: 1000 });
    expect((await db.query('select nom from contacts where id = $1', [contactB])).rows[0].nom).toBe('Fournisseur B');
  });

  test('une dépense de A refuse le fournisseur ou la caisse de B', async () => {
    await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, JSON.stringify({ libelle: 'X', montant: 10, mode: 'virement', fournisseur_id: contactB })])).rejects.toThrow(/Fournisseur inconnu/);
    await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, JSON.stringify({ libelle: 'X', montant: 10, mode: 'especes', session_caisse_id: sessionB })])).rejects.toThrow(/Caisse introuvable/);
  });

  test("les opérations sur une vente, un paiement, une dépense ou une caisse de B sont refusées", async () => {
    await expect(comme(gerantA, "select annuler_vente($1, 'Sabotage')", [venteB])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerantA, "select encaisser_paiement($1, 1, 'carte')", [venteB])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerantA, "select annuler_paiement($1, 'Sabotage')", [paiementB])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerantA, "select annuler_depense($1, 'Sabotage')", [depenseB])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerantA, 'select cloturer_caisse($1, 0)', [sessionB])).rejects.toThrow(/Permission refusée/);
    const credit = (await vendre(gerantA, etabA, sessionA, [{ article_id: service, quantite: 1 }], [], contactA))[0].v.vente_id;
    await expect(comme(gerantA, "select encaisser_paiement($1, 100, 'especes', $2)", [credit, sessionB])).rejects.toThrow(/Caisse introuvable/);
    expect((await db.query('select statut from ventes where id = $1', [venteB])).rows[0].statut).toBe('validee');
    expect((await db.query('select statut from sessions_caisse where id = $1', [sessionB])).rows[0].statut).toBe('ouverte');
  });

  test('reçu, aperçu de clôture et tableau de bord de B restent invisibles depuis A', async () => {
    await expect(comme(gerantA, 'select recu_vente($1)', [venteB])).rejects.toThrow(/introuvable/);
    await expect(comme(gerantA, 'select apercu_cloture($1)', [sessionB])).rejects.toThrow(/introuvable/);
    const tdb = await valeur(gerantA, 'select tableau_de_bord_commerce($1, current_date - 1, current_date + 1)', [etabB]);
    expect(Number(tdb.chiffre_affaires)).toBe(0);
    expect(Number(tdb.depenses)).toBe(0);
    expect(tdb.stock_bas).toEqual([]);
    expect(await comme(gerantA, 'select * from stock_articles where etablissement_id = $1', [etabB])).toHaveLength(0);
    expect(await comme(gerantA, 'select * from numerotations where etablissement_id = $1', [etabB])).toHaveLength(0);
  });
});

describe("contexte d'appel", () => {
  test('anon ne peut exécuter aucune fonction du schéma public', async () => {
    const executables = (await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')",
    )).rows;
    // Exceptions volontaires : la connexion par identifiant (réponse générique, verrou anti force brute)
    // et la marque d'un écran de connexion personnalisé (nom, logo, couleur : rien d'autre).
    expect(executables.map((e) => e.proname).sort()).toEqual(['marque_connexion', 'resoudre_connexion']);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select ouvrir_caisse($1)', [etabA]))).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select recu_vente($1)', [venteB]))).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select creer_client('Anonyme')"))).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select a_permission($1, $2)', [etabA, 'caisse.utiliser']))).rejects.toThrow(/permission denied/);
  });

  test('un membre inactif ne lit ni n\'écrit plus rien', async () => {
    await expect(comme(inactif, 'select ouvrir_caisse($1)', [etabA])).rejects.toThrow(/Permission refusée/);
    await expect(vendre(inactif, etabA, sessionA, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }])).rejects.toThrow(/Permission refusée/);
    for (const table of TABLES_COMMERCE) {
      expect(await comme(inactif, `select * from ${table}`)).toHaveLength(0);
    }
  });

  test('un ajustement de permission à false retire bien le droit de vendre', async () => {
    await expect(vendre(restreint, etabA, sessionA, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }])).rejects.toThrow(/Permission refusée/);
    await expect(comme(restreint, 'select ouvrir_caisse($1)', [etabA])).rejects.toThrow(/Permission refusée/);
  });

  test('un module désactivé refuse écriture et lecture', async () => {
    await comme(admin, "select definir_module_etablissement($1, 'depenses', false)", [etabA]);
    await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, '{"libelle":"X","montant":10,"mode":"virement"}'])).rejects.toThrow(/Permission refusée/);
    expect(await comme(gerantA, 'select * from depenses')).toHaveLength(0);
    await comme(admin, "select definir_module_etablissement($1, 'depenses', true)", [etabA]);
  });

  test('un établissement ou un client suspendu refuse toute écriture commerciale', async () => {
    await comme(admin, "select definir_statut_etablissement($1, 'suspendu')", [etabA]);
    await expect(vendre(gerantA, etabA, sessionA, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }])).rejects.toThrow(/suspendu/);
    await expect(comme(gerantA, "select ajuster_stock($1, $2, 'entree', 1)", [etabA, stylo])).rejects.toThrow(/suspendu/);
    await comme(admin, "select definir_statut_etablissement($1, 'actif')", [etabA]);
    await comme(admin, "select definir_statut_client($1, 'suspendu')", [clientB]);
    await expect(vendre(gerantB, etabB, sessionB, [{ article_id: articleB, quantite: 1 }], [{ mode: 'especes', montant: 1000 }])).rejects.toThrow(/suspendu/);
    await expect(comme(gerantB, "select annuler_vente($1, 'Test')", [venteB])).rejects.toThrow(/suspendu/);
    await expect(comme(gerantB, 'select cloturer_caisse($1, 0)', [sessionB])).rejects.toThrow(/suspendu/);
    await comme(admin, "select definir_statut_client($1, 'actif')", [clientB]);
  });

  test('le super admin ne lit les données commerciales qu\'en session support, et n\'écrit jamais', async () => {
    for (const table of TABLES_COMMERCE) {
      expect(await comme(admin, `select * from ${table}`)).toHaveLength(0);
    }
    await expect(comme(admin, 'select recu_vente($1)', [venteB])).rejects.toThrow(/introuvable/);
    await expect(comme(admin, 'select apercu_cloture($1)', [sessionB])).rejects.toThrow(/introuvable/);
    await commeRole(db, 'authenticated', admin, async (tx) => {
      const support = (await tx.query("select ouvrir_session_support($1, 'Diagnostic') id", [etabB])).rows[0].id;
      await tx.query("select set_config('app.session_support_id', $1, true)", [support]);
      expect((await tx.query('select id from ventes')).rows.map((r) => r.id)).toEqual([venteB]);
      expect((await tx.query('select recu_vente($1) r', [venteB])).rows[0].r.vente.id).toBe(venteB);
    });
    await expect(commeRole(db, 'authenticated', admin, async (tx) => {
      const support = (await tx.query("select ouvrir_session_support($1, 'Diagnostic') id", [etabB])).rows[0].id;
      await tx.query("select set_config('app.session_support_id', $1, true)", [support]);
      await tx.query("select annuler_vente($1, 'Support')", [venteB]);
    })).rejects.toThrow(/Permission refusée/);
  });
});

describe('valeurs hostiles', () => {
  test('quantités nulles, négatives, NaN, infinies ou démesurées sont refusées sans trace', async () => {
    const ventes = await nombre('select count(*) from ventes');
    const numero = await nombre("select prochain_numero from numerotations where etablissement_id = $1 and type = 'vente'", [etabA]);
    for (const quantite of [0, -1, 'NaN', 'Infinity', '-Infinity', null, '1e20']) {
      await expect(vendre(caissierA, etabA, sessionA, [{ article_id: service, quantite }], [{ mode: 'especes', montant: 100 }], contactA)).rejects.toThrow();
    }
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: -5 }, { article_id: stylo, quantite: 6 }], [{ mode: 'especes', montant: 500 }])).rejects.toThrow(/Quantité invalide/);
    expect(await nombre('select count(*) from ventes')).toBe(ventes);
    expect(await nombre("select prochain_numero from numerotations where etablissement_id = $1 and type = 'vente'", [etabA])).toBe(numero);
    expect(await stock(stylo)).toBe(10);
  });

  test('des lignes dupliquées ne contournent pas le contrôle du stock', async () => {
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 6 }, { article_id: stylo, quantite: 6 }], [{ mode: 'especes', montant: 6000 }])).rejects.toThrow(/Stock insuffisant/);
    expect(await stock(stylo)).toBe(10);
  });

  test('remises négatives, supérieures au total ou NaN sont refusées', async () => {
    const paiement = [{ mode: 'especes', montant: 1000 }];
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1, remise: -100 }], paiement)).rejects.toThrow(/Remise invalide/);
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1, remise: 600 }], paiement)).rejects.toThrow(/Remise invalide/);
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1, remise: 'NaN' }], paiement)).rejects.toThrow(/Remise invalide/);
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }], paiement, null, -1)).rejects.toThrow(/Remise globale/);
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }], paiement, null, 501)).rejects.toThrow(/Remise globale/);
    await expect(vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }], paiement, null, 'NaN')).rejects.toThrow(/Remise globale/);
    // Une remise au-delà du centime est arrondie, jamais une cause d'incohérence.
    const resultat = (await vendre(caissierA, etabA, sessionA, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }], null, 0.005))[0].v;
    expect(Number(resultat.total)).toBe(99.99);
  });

  test('panier absent, mal formé ou paiements invalides sont refusés', async () => {
    const ventes = await nombre('select count(*) from ventes');
    await expect(vendre(caissierA, etabA, sessionA, null)).rejects.toThrow(/panier est vide/);
    await expect(vendre(caissierA, etabA, sessionA, [])).rejects.toThrow(/panier est vide/);
    await expect(vendre(caissierA, etabA, sessionA, { article_id: service, quantite: 1 })).rejects.toThrow(/panier est vide/);
    await expect(vendre(caissierA, etabA, sessionA, ['x'])).rejects.toThrow(/Ligne de vente invalide/);
    const ligne = [{ article_id: service, quantite: 1 }];
    await expect(vendre(caissierA, etabA, sessionA, ligne, [{ mode: 'bitcoin', montant: 100 }])).rejects.toThrow(/Mode de paiement inconnu/);
    await expect(vendre(caissierA, etabA, sessionA, ligne, [{ montant: 100 }])).rejects.toThrow(/Mode de paiement inconnu/);
    for (const montant of [0, -100, 'NaN', null, 0.001]) {
      await expect(vendre(caissierA, etabA, sessionA, ligne, [{ mode: 'especes', montant }], contactA)).rejects.toThrow(/Montant de paiement invalide/);
    }
    await expect(vendre(caissierA, etabA, sessionA, ligne, [{ mode: 'carte', montant: 200 }])).rejects.toThrow(/hors espèces/);
    await expect(comme(caissierA, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etabA, sessionA, JSON.stringify(ligne), '{"mode":"especes","montant":100}'])).rejects.toThrow(/Paiements invalides/);
    await expect(vendre(caissierA, etabA, sessionA, ligne, ['especes'])).rejects.toThrow(/Paiements invalides/);
    expect(await nombre('select count(*) from ventes')).toBe(ventes);
  });

  test('NaN est refusé dans le stock, les articles, les dépenses, la caisse et les paiements', async () => {
    await expect(comme(gerantA, "select ajuster_stock($1, $2, 'entree', 'NaN'::numeric)", [etabA, stylo])).rejects.toThrow();
    await expect(comme(gerantA, "select ajuster_stock($1, $2, 'inventaire', 'NaN'::numeric)", [etabA, stylo])).rejects.toThrow();
    await expect(comme(gerantA, "select ajuster_stock($1, $2, 'ajustement', 'NaN'::numeric, 'Test')", [etabA, stylo])).rejects.toThrow();
    expect(await stock(stylo)).toBe(10);
    await expect(comme(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, '{"nom":"NaN1","prix_vente":"NaN"}'])).rejects.toThrow();
    await expect(comme(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, '{"nom":"NaN2","prix_vente":1,"stock_initial":"NaN"}'])).rejects.toThrow();
    await expect(comme(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, '{"nom":"NaN3","prix_vente":1,"stock_initial":-1}'])).rejects.toThrow(/négatif/);
    expect(await nombre("select count(*) from articles where nom like 'NaN%'")).toBe(0);
    for (const montant of ['NaN', 0, -5]) {
      await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, JSON.stringify({ libelle: 'X', montant, mode: 'virement' })])).rejects.toThrow();
    }
    await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, '{"libelle":"X","montant":10,"mode":"troc"}'])).rejects.toThrow();
    const pdv = await valeur(gerantA, "select enregistrer_point_de_vente($1, 'Caisse NaN')", [etabA]);
    await expect(comme(gerantA, "select ouvrir_caisse($1, $2, 'NaN'::numeric)", [etabA, pdv])).rejects.toThrow();
    await expect(comme(gerantA, 'select ouvrir_caisse($1, $2, -1)', [etabA, pdv])).rejects.toThrow(/négatif/);
    const credit = (await vendre(caissierA, etabA, sessionA, [{ article_id: service, quantite: 2 }], [], contactA))[0].v.vente_id;
    for (const montant of ['NaN', 0, -1, 201]) {
      await expect(comme(caissierA, "select encaisser_paiement($1, $2::numeric, 'especes', $3)", [credit, montant, sessionA])).rejects.toThrow(/reste dû/);
    }
    await expect(comme(caissierA, "select encaisser_paiement($1, 10, 'bitcoin', $2)", [credit, sessionA])).rejects.toThrow(/Mode de paiement inconnu/);
    await expect(comme(caissierA, "select encaisser_paiement($1, 10, 'especes')", [credit])).rejects.toThrow(/caisse ouverte/);
  });

  test('un JSON hostile reste une donnée : ni injection, ni changement d\'établissement', async () => {
    const nom = "'); drop table ventes; --";
    const id = await valeur(gerantA, 'select enregistrer_article($1, $2::jsonb)', [etabA, JSON.stringify({ nom, prix_vente: 1, etablissement_id: etabB, actif: false, suivi_stock: false })]);
    const article = (await db.query('select nom, etablissement_id from articles where id = $1', [id])).rows[0];
    expect(article).toEqual({ nom, etablissement_id: etabA });
    expect(await nombre('select count(*) from ventes')).toBeGreaterThan(0);
    const contact = await valeur(gerantA, 'select enregistrer_contact($1, $2::jsonb)', [etabA, JSON.stringify({ nom: 'Hostile', etablissement_id: etabB })]);
    expect((await db.query('select etablissement_id from contacts where id = $1', [contact])).rows[0].etablissement_id).toBe(etabA);
    await expect(comme(gerantA, 'select enregistrer_contact($1, $2::jsonb)', [etabA, '{"nom":"X","type":"admin"}'])).rejects.toThrow();
  });
});

describe('cycle de vie des ventes et des caisses', () => {
  test("l'annulation rend le stock exact, même avec des lignes dupliquées, et ne se rejoue pas", async () => {
    const vente = (await vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 2 }, { article_id: stylo, quantite: 3 }], [{ mode: 'especes', montant: 2500 }]))[0].v.vente_id;
    expect(await stock(stylo)).toBe(5);
    await comme(gerantA, "select annuler_vente($1, 'Erreur')", [vente]);
    expect(await stock(stylo)).toBe(10);
    await expect(comme(gerantA, "select annuler_vente($1, 'Encore')", [vente])).rejects.toThrow(/déjà annulée/);
    expect(await stock(stylo)).toBe(10);
    await expect(comme(caissierA, "select encaisser_paiement($1, 1, 'especes', $2)", [vente, sessionA])).rejects.toThrow(/annulée/);
    const paiement = (await db.query('select id from paiements where vente_id = $1', [vente])).rows[0].id;
    await expect(comme(caissierA, "select annuler_paiement($1, 'Encore')", [paiement])).rejects.toThrow(/déjà annulé/);
    await expect(comme(gerantA, "select annuler_vente($1, '   ')", [venteB])).rejects.toThrow(/Permission refusée/);
  });

  test("une vente ne s'annule plus si l'un de ses paiements est dans une caisse clôturée", async () => {
    const pdv = await valeur(gerantA, "select enregistrer_point_de_vente($1, 'Caisse 2')", [etabA]);
    const session2 = await valeur(gerantA, 'select ouvrir_caisse($1, $2)', [etabA, pdv]);
    const vente = (await vendre(caissierA, etabA, sessionA, [{ article_id: service, quantite: 1 }], [], contactA))[0].v.vente_id;
    await comme(caissierA, "select encaisser_paiement($1, 100, 'especes', $2)", [vente, session2]);
    const z = await valeur(gerantA, 'select cloturer_caisse($1, 100)', [session2]);
    expect(Number(z.especes_attendues)).toBe(100);
    await expect(comme(gerantA, "select annuler_vente($1, 'Après Z')", [vente])).rejects.toThrow(/caisse clôturée/);
    expect((await db.query('select statut from paiements where vente_id = $1', [vente])).rows[0].statut).toBe('valide');
    expect((await db.query('select statut from ventes where id = $1', [vente])).rows[0].statut).toBe('validee');
  });

  test('clôture : ni double clôture, ni annulation après Z, ni réouverture', async () => {
    const pdv = await valeur(gerantA, "select enregistrer_point_de_vente($1, 'Caisse 3')", [etabA]);
    const session = await valeur(gerantA, 'select ouvrir_caisse($1, $2, 1000)', [etabA, pdv]);
    const vente = (await vendre(caissierA, etabA, session, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }]))[0].v.vente_id;
    const paiement = (await db.query('select id from paiements where vente_id = $1', [vente])).rows[0].id;
    await expect(comme(gerantA, "select cloturer_caisse($1, 'NaN'::numeric)", [session])).rejects.toThrow();
    await expect(comme(gerantA, 'select cloturer_caisse($1, -1)', [session])).rejects.toThrow(/espèces comptées/);
    await expect(commeRole(db, 'authenticated', gerantA, async (tx) => {
      await tx.query('select cloturer_caisse($1, 1100)', [session]);
      await tx.query('select cloturer_caisse($1, 1100)', [session]);
    })).rejects.toThrow(/déjà clôturée/);
    expect(await nombre('select count(*) from clotures where session_caisse_id = $1', [session])).toBe(0);
    await comme(gerantA, 'select cloturer_caisse($1, 1100)', [session]);
    await expect(comme(gerantA, 'select cloturer_caisse($1, 1100)', [session])).rejects.toThrow(/déjà clôturée/);
    expect(await nombre('select count(*) from clotures where session_caisse_id = $1', [session])).toBe(1);
    await expect(comme(gerantA, "select annuler_vente($1, 'Trop tard')", [vente])).rejects.toThrow(/clôturée/);
    await expect(comme(caissierA, "select annuler_paiement($1, 'Trop tard')", [paiement])).rejects.toThrow(/clôturée/);
    await expect(vendre(caissierA, etabA, session, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }])).rejects.toThrow(/Aucune caisse ouverte/);
    await expect(comme(gerantA, 'select enregistrer_depense($1, $2::jsonb)', [etabA, JSON.stringify({ libelle: 'X', montant: 10, mode: 'especes', session_caisse_id: session })])).rejects.toThrow(/clôturée/);
    await expect(db.query("update sessions_caisse set statut = 'ouverte', cloturee_le = null where id = $1", [session])).rejects.toThrow(/définitive/);
    await expect(db.query('update sessions_caisse set fond_initial = 999 where id = $1', [sessionA])).rejects.toThrow(/clôture/);
    const nouvelle = await valeur(gerantA, 'select ouvrir_caisse($1, $2)', [etabA, pdv]);
    expect(nouvelle).not.toBe(session);
  });

  test('la numérotation est continue et intouchable par le gérant', async () => {
    const numeros = (await db.query("select numero from ventes where etablissement_id = $1 order by numero", [etabA])).rows.map((r) => r.numero);
    expect(numeros).toEqual(numeros.map((_, i) => `V-${String(i + 1).padStart(5, '0')}`));
    expect(await comme(gerantA, 'update numerotations set prochain_numero = 1 where etablissement_id = $1 returning *', [etabA])).toHaveLength(0);
    await expect(comme(gerantA, "insert into numerotations(etablissement_id, type, prefixe) values($1, 'avoir', 'X-')", [etabA])).rejects.toThrow();
    expect(await comme(gerantA, "delete from numerotations where etablissement_id = $1 returning *", [etabA])).toHaveLength(0);
    const suivante = (await vendre(caissierA, etabA, sessionA, [{ article_id: service, quantite: 1 }], [{ mode: 'especes', montant: 100 }]))[0].v.numero;
    expect(suivante).toBe(`V-${String(numeros.length + 1).padStart(5, '0')}`);
  });
});

describe('écritures directes et privilèges', () => {
  test("aucune table commerciale n'accepte d'écriture directe, même du gérant", async () => {
    const vente = (await db.query('select id from ventes where etablissement_id = $1 limit 1', [etabA])).rows[0].id;
    const lignes = {
      categories_articles: "insert into categories_articles(etablissement_id, nom) values($1, 'Direct')",
      articles: "insert into articles(etablissement_id, nom, prix_vente) values($1, 'Direct', 1)",
      contacts: "insert into contacts(etablissement_id, nom) values($1, 'Direct')",
      sessions_caisse: `insert into sessions_caisse(etablissement_id, point_de_vente_id, ouverte_par) select $1, id, '${gerantA}' from points_de_vente where etablissement_id = $1 limit 1`,
      ventes: `insert into ventes(etablissement_id, numero, sous_total, total, statut_paiement, vendeur) values($1, 'V-99999', 0, 0, 'payee', '${gerantA}')`,
      lignes_vente: `insert into lignes_vente(vente_id, etablissement_id, article_id, libelle, quantite, prix_unitaire, total) values('${vente}', $1, '${stylo}', 'x', 1, 0, 0)`,
      paiements: `insert into paiements(etablissement_id, vente_id, mode, montant, encaisse_par) values($1, '${vente}', 'especes', 1, '${gerantA}')`,
      mouvements_stock: `insert into mouvements_stock(etablissement_id, article_id, type, quantite, acteur) values($1, '${stylo}', 'entree', 99, '${gerantA}')`,
      depenses: `insert into depenses(etablissement_id, libelle, montant, mode, cree_par) values($1, 'Direct', 1, 'especes', '${gerantA}')`,
      clotures: "insert into clotures(etablissement_id) values($1)",
    };
    for (const table of TABLES_COMMERCE) {
      await expect(comme(gerantA, lignes[table], [etabA])).rejects.toThrow();
      expect(await comme(gerantA, `update ${table} set etablissement_id = etablissement_id where etablissement_id = $1 returning 1`, [etabA])).toHaveLength(0);
      expect(await comme(gerantA, `delete from ${table} where etablissement_id = $1 returning 1`, [etabA])).toHaveLength(0);
      await expect(commeRole(db, 'anon', null, (tx) => tx.query(`delete from ${table}`))).rejects.toThrow(/permission denied/);
    }
    expect(await comme(gerantA, 'update ventes set total = 0, montant_paye = 0 where id = $1 returning 1', [vente])).toHaveLength(0);
    expect(await comme(gerantA, "update stock_articles set nom = 'X' where etablissement_id = $1 returning 1", [etabA])).toHaveLength(0);
  });

  test('TRUNCATE, CREATE TRIGGER et setval sont impossibles depuis l\'API', async () => {
    for (const table of [...TABLES_COMMERCE, 'journal_audit', 'evenements', 'etablissements', 'etablissement_membres']) {
      await expect(comme(gerantA, `truncate ${table} cascade`)).rejects.toThrow(/permission denied/);
      await expect(commeRole(db, 'anon', null, (tx) => tx.query(`truncate ${table} cascade`))).rejects.toThrow(/permission denied/);
    }
    await expect(comme(gerantA, 'create trigger piege before insert on ventes for each row execute function refuser_suppression()')).rejects.toThrow(/permission denied/);
    await expect(comme(gerantA, "select setval('journal_audit_id_seq', 1)")).rejects.toThrow(/permission denied/);
    await expect(comme(gerantA, "select nextval('mouvements_stock_id_seq')")).rejects.toThrow(/permission denied/);
    const privileges = (await db.query(
      `select c.relname, r.rolname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(rolname)
       where n.nspname = 'public' and c.relkind in ('r', 'v')
         and (has_table_privilege(r.rolname, c.oid, 'TRUNCATE') or has_table_privilege(r.rolname, c.oid, 'TRIGGER')
              or has_table_privilege(r.rolname, c.oid, 'REFERENCES'))`,
    )).rows;
    expect(privileges).toEqual([]);
    expect(await nombre('select count(*) from journal_audit')).toBeGreaterThan(0);
    // Même le propriétaire ne vide pas le journal ni les ventes.
    await expect(db.query('truncate journal_audit')).rejects.toThrow(/Suppression interdite/);
  });

  test('les journaux restent écrits par les membres via leurs droits normaux', async () => {
    const id = (await comme(caissierA, "insert into evenements(etablissement_id, type, acteur) values($1, 'test', $2) returning id", [etabA, caissierA]))[0].id;
    expect(Number(id)).toBeGreaterThan(0);
  });

  test('les fonctions internes sont fermées et toute fonction security definer fixe son search_path', async () => {
    for (const appel of [
      "select exiger_permission($1, 'caisse.utiliser')",
      "select prochain_numero($1, 'vente', 'V-')",
      'select stock_article($1)',
      'select recalculer_paiement_vente($1)',
    ]) {
      await expect(comme(gerantA, appel, [etabA])).rejects.toThrow(/permission denied/);
    }
    await expect(comme(gerantA, 'select exiger_super_admin()')).rejects.toThrow(/permission denied/);
    const sansChemin = (await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    )).rows;
    expect(sansChemin).toEqual([]);
  });

  test('une fonction ajoutée plus tard n\'est pas exécutable par anon par défaut', async () => {
    await db.query('create function public.fonction_future_audit() returns int language sql as $$ select 1 $$');
    expect((await db.query("select has_function_privilege('anon', 'public.fonction_future_audit()', 'execute') v")).rows[0].v).toBe(false);
    await db.query('drop function public.fonction_future_audit()');
  });

  test("les verrous d'immuabilité tiennent même pour le propriétaire", async () => {
    const vente = (await db.query("select id from ventes where etablissement_id = $1 and statut = 'validee' limit 1", [etabA])).rows[0].id;
    await expect(db.query('update ventes set etablissement_id = $2 where id = $1', [vente, etabB])).rejects.toThrow();
    await expect(db.query('update ventes set contact_id = $2 where id = $1', [vente, contactB])).rejects.toThrow(/annulez-la/);
    await expect(db.query('update articles set etablissement_id = $2 where id = $1', [stylo, etabB])).rejects.toThrow(/établissement/);
    await expect(db.query('update mouvements_stock set quantite = 1000 where article_id = $1', [stylo])).rejects.toThrow(/définitive/);
    await expect(db.query('update clotures set ecart = 0')).rejects.toThrow(/définitive/);
    await expect(db.query('delete from paiements where vente_id = $1', [vente])).rejects.toThrow(/Suppression interdite/);
    await expect(db.query("update paiements set montant = 1 where vente_id = $1", [vente])).rejects.toThrow(/annulation/);
    await expect(db.query("update journal_audit set acteur = null")).rejects.toThrow(/ajout seul/);
  });
});

describe("journal d'audit", () => {
  test("chaque table commerciale est journalisée, lignes et mouvements compris", async () => {
    const sansAudit = (await db.query(
      `select t from unnest($1::text[]) t
       where not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and g.tgname = t || '_audit')`,
      [[...TABLES_COMMERCE, 'plateforme_admins']],
    )).rows;
    expect(sansAudit).toEqual([]);
    const avant = await nombre("select count(*) from journal_audit where table_nom in ('lignes_vente', 'mouvements_stock')");
    await vendre(caissierA, etabA, sessionA, [{ article_id: stylo, quantite: 1 }], [{ mode: 'especes', montant: 500 }]);
    const lignes = (await db.query(
      "select table_nom, acteur from journal_audit where table_nom in ('lignes_vente', 'mouvements_stock') order by id desc limit 2",
    )).rows;
    expect(await nombre("select count(*) from journal_audit where table_nom in ('lignes_vente', 'mouvements_stock')")).toBe(avant + 2);
    expect(lignes.every((l) => l.acteur === caissierA)).toBe(true);
  });

  test('le drapeau mode_support ne peut pas être falsifié par une simple variable', async () => {
    await commeRole(db, 'authenticated', gerantA, async (tx) => {
      await tx.query("select set_config('app.session_support_id', 'faux', true)");
      await tx.query("select enregistrer_categorie($1, 'Usurpation')", [etabA]);
    });
    const ligne = (await db.query("select mode_support, acteur from journal_audit where table_nom = 'categories_articles' order by id desc limit 1")).rows[0];
    expect(ligne).toEqual({ mode_support: false, acteur: gerantA });
  });

  test("l'auteur d'une invitation ne peut pas être usurpé", async () => {
    const id = (await comme(gerantA, "insert into invitations(email, etablissement_id, role_id, cree_par) values('cible@audit.test', $1, 'employe', $2) returning id", [etabA, admin]))[0].id;
    expect((await db.query('select cree_par from invitations where id = $1', [id])).rows[0].cree_par).toBe(gerantA);
    expect(await comme(gerantA, 'update invitations set cree_par = $2 where id = $1 returning 1', [id, admin]).catch((e) => e.message)).toMatch(/auteur/);
  });
});
