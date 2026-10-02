import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { appliquerMigrations, commeRole, creerBase } from './helpers/db.js';

// Hubs : structure, conservation du stock, transferts, inventaires, accès par Hub.
let db;
let admin;
let patron;
let caissierA;
let depotier;
let respB;
let autrePatron;
let etab;
let autreEtab;
let depot;
let hubA;
let hubB;
let principal;
let autreHub;
let savon;
let riz;
let autreArticle;
let caisseA;
let caisseB;
let sessionA;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const stockHub = async (hub, article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [hub, article])).rows[0].q);
const stockTotal = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).rows[0].q);
const json = (v) => JSON.stringify(v);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@hubs.test');
  patron = await utilisateur('patron@hubs.test');
  caissierA = await utilisateur('caissier-a@hubs.test');
  depotier = await utilisateur('depot@hubs.test');
  respB = await utilisateur('resp-b@hubs.test');
  autrePatron = await utilisateur('autre@hubs.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Commerce Hubs')");
  const autreClient = await valeur(admin, "select creer_client('Concurrent')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Commerce Hubs')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Concurrent')", [autreClient]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'gestionnaire_depot'), ($1, $5, 'responsable_hub'), ($6, $7, 'gerant')`,
    [etab, patron, caissierA, depotier, respB, autreEtab, autrePatron]
  );
  principal = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  autreHub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [autreEtab])).rows[0].id;
});

afterAll(async () => db.close());

describe('structure des Hubs', () => {
  test('chaque établissement a un Hub principal, avec sa caisse principale', async () => {
    expect(principal).toBeTruthy();
    const caisses = (await db.query('select nom, hub_id from points_de_vente where etablissement_id = $1', [etab])).rows;
    expect(caisses).toEqual([{ nom: 'Caisse principale', hub_id: principal }]);
  });

  test('le patron crée un dépôt et deux points de vente ; le caissier ne peut pas', async () => {
    await expect(comme(caissierA, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Pirate' })])).rejects.toThrow(/Permission refusée/);
    depot = await valeur(patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Dépôt principal', type: 'depot' })]);
    hubA = await valeur(patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Magasin A', type: 'point_de_vente' })]);
    hubB = await valeur(patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Magasin B' })]);
    const d = (await db.query('select capacite_vente, capacite_caisse, capacite_stock from hubs where id = $1', [depot])).rows[0];
    expect(d).toEqual({ capacite_vente: false, capacite_caisse: false, capacite_stock: true });
    caisseA = (await db.query('select id from points_de_vente where hub_id = $1', [hubA])).rows[0].id;
    caisseB = (await db.query('select id from points_de_vente where hub_id = $1', [hubB])).rows[0].id;
    expect((await db.query('select count(*)::int n from points_de_vente where hub_id = $1', [depot])).rows[0].n).toBe(0);
  });

  test('un dépôt sans capacité caisse ne reçoit pas de caisse ; un Hub principal ne se désactive pas', async () => {
    await expect(comme(patron, "select enregistrer_caisse($1, $2, 'Caisse dépôt')", [etab, depot])).rejects.toThrow(/pas de caisse/);
    await expect(comme(patron, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ id: principal, nom: 'Hub principal', actif: false })])).rejects.toThrow(/principal/);
  });

  test('un Hub ne peut pas être supprimé ni changer d’établissement', async () => {
    await expect(db.query('delete from hubs where id = $1', [hubA])).rejects.toThrow(/Suppression interdite/);
    await expect(db.query('update hubs set etablissement_id = $1 where id = $2', [autreEtab, hubA])).rejects.toThrow(/établissement/);
  });

  test('un Hub d’un autre établissement est refusé partout (clé composée)', async () => {
    await expect(db.query("insert into points_de_vente(etablissement_id, hub_id, nom) values ($1, $2, 'Fraude')", [etab, autreHub])).rejects.toThrow();
    await expect(comme(patron, "select enregistrer_caisse($1, $2, 'Fraude')", [etab, autreHub])).rejects.toThrow(/introuvable/);
  });
});

describe('conservation du stock (scénario obligatoire 100 / 25 / 15)', () => {
  test('stock initial : dépôt 100, A 25, B 15, total 140', async () => {
    savon = await valeur(patron, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Savon', prix_vente: 500, cout_achat: 300 })]);
    riz = await valeur(patron, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 5 kg', prix_vente: 4500, cout_achat: 3500 })]);
    await comme(patron, "select ajuster_stock_hub($1, $2, 'entree', 100, 'Réception')", [depot, savon]);
    await comme(patron, "select ajuster_stock_hub($1, $2, 'entree', 25, 'Réception')", [hubA, savon]);
    await comme(patron, "select ajuster_stock_hub($1, $2, 'entree', 15, 'Réception')", [hubB, savon]);
    expect([await stockHub(depot, savon), await stockHub(hubA, savon), await stockHub(hubB, savon)]).toEqual([100, 25, 15]);
    expect(await stockTotal(savon)).toBe(140);
  });

  test('transfert de 20 du dépôt vers A : 80 / 45 / 15, total inchangé', async () => {
    const r = await valeur(depotier, 'select transferer_stock($1, $2, $3, $4::jsonb, $5)', [etab, depot, hubA, json([{ article_id: savon, quantite: 20 }]), 'Réassort']);
    expect(r.numero).toBe('T-00001');
    expect([await stockHub(depot, savon), await stockHub(hubA, savon), await stockHub(hubB, savon)]).toEqual([80, 45, 15]);
    expect(await stockTotal(savon)).toBe(140);
    const t = (await db.query('select hub_source_id, hub_destination_id, statut, motif, auteur from transferts where id = $1', [r.transfert_id])).rows[0];
    expect(t).toEqual({ hub_source_id: depot, hub_destination_id: hubA, statut: 'valide', motif: 'Réassort', auteur: depotier });
  });

  test('vente de 5 dans A : A passe à 40, total 135', async () => {
    sessionA = await valeur(caissierA, 'select ouvrir_caisse($1, $2, 0)', [etab, caisseA]);
    const v = await valeur(caissierA, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, sessionA, json([{ article_id: savon, quantite: 5 }]), json([{ mode: 'especes', montant: 2500 }])]);
    expect(v.hub_id).toBe(hubA);
    const vente = (await db.query('select hub_id, point_de_vente_id, session_caisse_id, vendeur from ventes where id = $1', [v.vente_id])).rows[0];
    expect(vente).toEqual({ hub_id: hubA, point_de_vente_id: caisseA, session_caisse_id: sessionA, vendeur: caissierA });
    expect([await stockHub(depot, savon), await stockHub(hubA, savon), await stockHub(hubB, savon)]).toEqual([80, 40, 15]);
    expect(await stockTotal(savon)).toBe(135);
    // Annulation : le stock revient dans le même Hub.
    await comme(patron, "select annuler_vente($1, 'Erreur de saisie')", [v.vente_id]);
    expect([await stockHub(depot, savon), await stockHub(hubA, savon), await stockHub(hubB, savon)]).toEqual([80, 45, 15]);
    expect(await stockTotal(savon)).toBe(140);
  });

  test('la vente contrôle le stock du Hub de la caisse, pas celui de l’établissement', async () => {
    await expect(comme(caissierA, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, sessionA, json([{ article_id: savon, quantite: 46 }]), json([{ mode: 'especes', montant: 23000 }])]))
      .rejects.toThrow(/Stock insuffisant.*Magasin A.*45/);
  });
});

describe('transferts : refus et annulation', () => {
  test('source = destination, Hub étranger, stock insuffisant, quantité négative : tout est refusé sans trace', async () => {
    const avant = (await db.query('select count(*)::int n from mouvements_stock')).rows[0].n;
    await expect(comme(patron, 'select transferer_stock($1, $2, $2, $3::jsonb)', [etab, depot, json([{ article_id: savon, quantite: 1 }])])).rejects.toThrow(/différents/);
    await expect(comme(patron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, autreHub, json([{ article_id: savon, quantite: 1 }])])).rejects.toThrow(/appartenir/);
    await expect(comme(patron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, hubB, hubA, json([{ article_id: savon, quantite: 16 }])])).rejects.toThrow(/Stock insuffisant/);
    await expect(comme(patron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, hubA, json([{ article_id: savon, quantite: -3 }])])).rejects.toThrow(/Quantité invalide/);
    await expect(comme(patron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, hubA, json([{ article_id: savon, quantite: 1 }, { article_id: riz, quantite: 1 }])])).rejects.toThrow(/Stock insuffisant.*Riz/);
    expect((await db.query('select count(*)::int n from mouvements_stock')).rows[0].n).toBe(avant);
    expect((await db.query('select count(*)::int n from transferts')).rows[0].n).toBe(1);
  });

  test('le caissier ne transfère pas ; un autre établissement non plus', async () => {
    await expect(comme(caissierA, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, hubA, json([{ article_id: savon, quantite: 1 }])])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autrePatron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, hubA, json([{ article_id: savon, quantite: 1 }])])).rejects.toThrow(/Permission refusée/);
  });

  test('annuler un transfert remet le stock à la source, avec motif obligatoire', async () => {
    const r = await valeur(patron, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, depot, hubB, json([{ article_id: savon, quantite: 10 }])]);
    expect([await stockHub(depot, savon), await stockHub(hubB, savon)]).toEqual([70, 25]);
    await expect(comme(patron, "select annuler_transfert($1, '')", [r.transfert_id])).rejects.toThrow(/motif/);
    await comme(patron, "select annuler_transfert($1, 'Mauvais magasin')", [r.transfert_id]);
    expect([await stockHub(depot, savon), await stockHub(hubB, savon)]).toEqual([80, 15]);
    await expect(comme(patron, "select annuler_transfert($1, 'Encore')", [r.transfert_id])).rejects.toThrow(/déjà annulé/);
    expect(await stockTotal(savon)).toBe(140);
  });

  test('un transfert et ses mouvements sont définitifs', async () => {
    await expect(db.query("update lignes_transfert set quantite = 1")).rejects.toThrow(/définitive/);
    await expect(db.query("delete from transferts")).rejects.toThrow(/Suppression interdite/);
    await expect(db.query("update mouvements_stock set quantite = 1 where transfert_id is not null")).rejects.toThrow(/définitive/);
    await expect(db.query("update mouvements_stock set hub_id = $1 where hub_id = $2", [hubB, hubA])).rejects.toThrow();
  });
});

describe('inventaire par Hub', () => {
  test('les écarts deviennent des mouvements « inventaire » dans le Hub compté', async () => {
    const r = await valeur(depotier, 'select enregistrer_inventaire($1, $2::jsonb, $3)', [depot, json([{ article_id: savon, quantite_comptee: 78 }, { article_id: riz, quantite_comptee: 0 }]), 'Inventaire mensuel']);
    expect(r).toMatchObject({ numero: 'I-00001', articles: 2, ecarts: 1 });
    const lignes = (await db.query('select libelle, quantite_theorique::float t, quantite_comptee::float c, ecart::float e from lignes_inventaire order by libelle')).rows;
    expect(lignes).toEqual([{ libelle: 'Riz 5 kg', t: 0, c: 0, e: 0 }, { libelle: 'Savon', t: 80, c: 78, e: -2 }]);
    expect(await stockHub(depot, savon)).toBe(78);
    expect(await stockHub(hubA, savon)).toBe(45);
    await expect(comme(caissierA, 'select enregistrer_inventaire($1, $2::jsonb)', [hubA, json([{ article_id: savon, quantite_comptee: 0 }])])).rejects.toThrow(/Permission refusée/);
    await expect(comme(depotier, 'select enregistrer_inventaire($1, $2::jsonb)', [depot, json([{ article_id: savon, quantite_comptee: 1 }, { article_id: savon, quantite_comptee: 2 }])])).rejects.toThrow(/deux fois/);
  });
});

describe('accès par Hub (côté base)', () => {
  test('un membre restreint au Hub B ne voit ni ne vend dans A', async () => {
    await comme(patron, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, respB, [hubB]]);
    const contexte = await valeur(respB, 'select mon_contexte()');
    expect(contexte.etablissements[0].hubs.map((h) => h.nom)).toEqual(['Magasin B']);
    expect(contexte.etablissements[0].hubs_restreints).toBe(true);
    await expect(comme(respB, 'select ouvrir_caisse($1, $2, 0)', [etab, caisseA])).rejects.toThrow(/Accès refusé à ce Hub/);
    await expect(comme(respB, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, sessionA, json([{ article_id: savon, quantite: 1 }]), json([{ mode: 'especes', montant: 500 }])])).rejects.toThrow(/Accès refusé/);
    await expect(comme(respB, 'select transferer_stock($1, $2, $3, $4::jsonb)', [etab, hubA, hubB, json([{ article_id: savon, quantite: 1 }])])).rejects.toThrow(/Accès refusé/);
    await expect(comme(respB, "select ajuster_stock_hub($1, $2, 'entree', 1)", [hubA, savon])).rejects.toThrow(/Accès refusé/);
    const ventesVues = await comme(respB, 'select hub_id from ventes');
    expect(ventesVues.every((v) => v.hub_id === hubB)).toBe(true);
    const mouvementsVus = await comme(respB, 'select distinct hub_id from mouvements_stock');
    expect(mouvementsVus.map((m) => m.hub_id)).toEqual([hubB]);
    expect(await comme(respB, 'select * from lignes_vente')).toEqual([]);
    // Il vend dans son Hub.
    const sessionB = await valeur(respB, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect((await db.query('select hub_id from sessions_caisse where id = $1', [sessionB])).rows[0].hub_id).toBe(hubB);
  });

  test('le caissier ne se donne pas d’accès ; on ne modifie pas ses propres Hubs', async () => {
    await expect(comme(caissierA, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, caissierA, []])).rejects.toThrow(/Permission refusée/);
    await expect(comme(caissierA, 'insert into membre_hubs(etablissement_id, user_id, hub_id) values ($1, $2, $3)', [etab, caissierA, hubA])).rejects.toThrow();
    await expect(comme(patron, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, patron, [hubA]])).rejects.toThrow(/propres Hubs/);
  });

  test('un Hub étranger ne peut pas être attribué', async () => {
    await expect(comme(patron, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, caissierA, [autreHub]])).rejects.toThrow(/Hub inconnu/);
  });

  test('l’autre établissement ne voit aucun Hub, aucun mouvement', async () => {
    expect(await comme(autrePatron, 'select * from hubs where etablissement_id = $1', [etab])).toEqual([]);
    expect(await comme(autrePatron, 'select * from transferts')).toEqual([]);
    expect(await comme(autrePatron, 'select * from mouvements_stock where etablissement_id = $1', [etab])).toEqual([]);
  });
});

describe('tableaux de bord', () => {
  test('consolidé et par Hub, avec valeurs de stock', async () => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const tout = await valeur(patron, 'select tableau_de_bord_hub($1, null, $2, $2)', [etab, aujourdhui]);
    expect(tout.par_hub.map((h) => h.nom)).toEqual(['Hub principal', 'Dépôt principal', 'Magasin A', 'Magasin B']);
    const a = await valeur(patron, 'select tableau_de_bord_hub($1, $2, $3, $3)', [etab, hubA, aujourdhui]);
    expect(a.par_hub).toHaveLength(1);
    expect(a.valeur_stock).toBe(45 * 300);
    const ancien = await valeur(patron, 'select tableau_de_bord_commerce($1, $2, $2)', [etab, aujourdhui]);
    expect(ancien.chiffre_affaires).toBe(tout.chiffre_affaires);
  });
});

describe('migration des données existantes', () => {
  test('les lignes existantes rejoignent le Hub principal, totaux identiques', async () => {
    const ancienne = await creerBase({ jusqua: '20261002000010' });
    const u = async (email) => (await ancienne.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
    const sa = await u('sa@migration.test');
    const g = await u('g@migration.test');
    await ancienne.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
    const c = async (user, sql, params = []) => commeRole(ancienne, 'authenticated', user, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);
    const client = await c(sa, "select creer_client('Avant Hubs')");
    const e = await c(sa, "select creer_etablissement($1, 'commerce', 'Boutique historique')", [client]);
    await ancienne.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant')", [e, g]);
    const art = await c(g, 'select enregistrer_article($1, $2::jsonb)', [e, json({ nom: 'Huile', prix_vente: 1000, stock_initial: 30 })]);
    const s = await c(g, 'select ouvrir_caisse($1)', [e]);
    const v = await c(g, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [e, s, json([{ article_id: art, quantite: 4 }]), json([{ mode: 'especes', montant: 4000 }])]);
    const v2 = await c(g, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [e, s, json([{ article_id: art, quantite: 1 }]), json([{ mode: 'especes', montant: 1000 }])]);
    await c(g, "select annuler_vente($1, 'Test')", [v2.vente_id]);
    await c(g, "select enregistrer_depense($1, $2::jsonb)", [e, json({ libelle: 'Transport', montant: 500, session_caisse_id: s })]);
    await c(g, 'select cloturer_caisse($1, 3500)', [s]);
    const avant = Number((await ancienne.query('select sum(quantite) q from mouvements_stock')).rows[0].q);
    expect(avant).toBe(26);

    await appliquerMigrations(ancienne, { depuis: '20261002000010' });

    const hub = (await ancienne.query('select id, nom from hubs where etablissement_id = $1 and principal', [e])).rows[0];
    expect(hub.nom).toBe('Hub principal');
    for (const table of ['points_de_vente', 'sessions_caisse', 'ventes', 'paiements', 'clotures', 'mouvements_stock', 'depenses']) {
      const r = (await ancienne.query(`select count(*)::int n, count(*) filter (where hub_id = $1)::int ok from ${table}`, [hub.id])).rows[0];
      expect(r.n, table).toBeGreaterThan(0);
      expect(r.ok, table).toBe(r.n);
    }
    expect(Number((await ancienne.query('select sum(quantite) q from mouvements_stock')).rows[0].q)).toBe(avant);
    expect(Number((await ancienne.query('select quantite from stock_hubs where article_id = $1', [art])).rows[0].quantite)).toBe(26);
    // L'historique reste immuable et l'application continue de fonctionner.
    await expect(ancienne.query('update ventes set hub_id = hub_id where id = $1', [v.vente_id])).resolves.toBeTruthy();
    const s2 = await c(g, 'select ouvrir_caisse($1)', [e]);
    await c(g, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [e, s2, json([{ article_id: art, quantite: 1 }]), json([{ mode: 'especes', montant: 1000 }])]);
    expect(Number((await ancienne.query('select sum(quantite) q from mouvements_stock where hub_id = $1', [hub.id])).rows[0].q)).toBe(25);
    await ancienne.close();
  });
});
