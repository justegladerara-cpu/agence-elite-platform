import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Réception intelligente : conditionnements et prix retenus par fournisseur, coût unitaire, alertes de prix, bon de
// réception, dette fournisseur (module Achats) et paiement immédiat ; droits et isolation.
let db;
let sa;
let gerant;
let depotier;
let caissier;
let autreGerant;
let etab;
let etabSansAchats;
let autreEtab;
let hub;
let hubSansAchats;
let grossiste;
let brasserie;
let biere;
let riz;
let savon;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const recevoir = (user, lignes, o = {}) => valeur(user, 'select recevoir_marchandise($1, $2::jsonb, $3, $4, $5, $6, $7, $8)', [
  o.hub ?? hub, json(lignes), o.fournisseur ?? null, o.reference ?? null, o.notes ?? null, o.paye ?? null, o.mode ?? null, o.simulation ?? false]);
const stock = async (article, h = hub) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [h, article])).rows[0].q);
const article = async (id) => (await db.query('select * from articles where id = $1', [id])).rows[0];
const memoire = async (id) => (await db.query('select * from conditionnements_articles where article_id = $1 order by utilise_le', [id])).rows;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ri.test');
  gerant = await utilisateur('gerant@ri.test');
  depotier = await utilisateur('depot@ri.test');
  caissier = await utilisateur('caisse@ri.test');
  autreGerant = await utilisateur('autre@ri.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const client = await valeur(sa, "select creer_client('Client Réception')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Réception')", [client]);
  etabSansAchats = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Simple')", [client]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Réception')", [await valeur(sa, "select creer_client('Autre')")]);
  await comme(sa, "select accorder_module($1, 'achats', true)", [etab]);
  await comme(sa, "select definir_module_etablissement($1, 'achats', true)", [etab]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'gestionnaire_depot'), ($1, $4, 'employe'), ($5, $6, 'gerant'), ($7, $2, 'gerant')`,
    [etab, gerant, depotier, caissier, autreEtab, autreGerant, etabSansAchats],
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [etab])).rows[0].id;
  hubSansAchats = (await db.query('select id from hubs where etablissement_id = $1 order by cree_le limit 1', [etabSansAchats])).rows[0].id;
  grossiste = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Grossiste du Port', type: 'fournisseur' })]);
  brasserie = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Brasserie', type: 'les_deux' })]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière 65 cl', prix_vente: 1000, cout_achat: 600 })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 1 kg', prix_vente: 900, cout_achat: 700, suivi_stock: false })]);
  savon = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Savon', prix_vente: 300 })]);
});

afterAll(async () => db.close());

describe('recevoir de la marchandise', () => {
  test('casiers + prix du casier : stock, coût unitaire, bon BR-, conditionnement retenu par fournisseur', async () => {
    const r = await recevoir(depotier, [{ article_id: biere, conditionnements: 5, par_conditionnement: 12, unites: 2, prix_conditionnement: 7200 }],
      { fournisseur: brasserie, reference: 'BL-77' });
    expect(r).toMatchObject({ numero: 'BR-00001', articles: 1, quantite_totale: 62, montant: 37200 });
    expect(await stock(biere)).toBe(62);
    const a = await article(biere);
    expect(Number(a.cout_achat)).toBe(600);
    // Le gestionnaire de dépôt n'a pas articles.gerer : le casier n'est pas retenu sur l'article, mais il l'est en mémoire.
    expect(a.unites_par_lot).toBeNull();
    const m = await memoire(biere);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ fournisseur_id: brasserie, nom: 'casier', unites: 12, utilisations: 1 });
    expect(Number(m[0].dernier_prix)).toBe(7200);
    expect(Number(m[0].derniere_quantite)).toBe(5);
    const bon = (await db.query('select * from receptions_marchandise where id = $1', [r.id])).rows[0];
    expect(bon).toMatchObject({ fournisseur_id: brasserie, reference: 'BL-77', articles: 1 });
    const mvt = (await db.query('select * from mouvements_stock where reception_marchandise_id = $1', [r.id])).rows;
    expect(mvt).toHaveLength(1);
    expect(Number(mvt[0].cout_unitaire)).toBe(600);
  });

  test('hausse de prix : alerte, prix conseillé (marge gardée), coût mis à jour ; le gérant retient le casier sur l’article', async () => {
    const simul = await recevoir(gerant, [{ article_id: biere, conditionnements: 2, par_conditionnement: 12, nom_conditionnement: 'casier', prix_conditionnement: 8400 }],
      { fournisseur: brasserie, simulation: true });
    expect(simul.simulation).toBe(true);
    expect(simul.alertes[0]).toMatchObject({ type: 'hausse', nom: 'Bière 65 cl', ancien_cout: 600, nouveau_cout: 700, pourcentage: 16.7 });
    // 1000 × 700 / 600 = 1166,67 → arrondi au-dessus à 5 près sous 1 000 et à 25 près ensuite : 1175.
    expect(simul.alertes[0].prix_conseille).toBe(1175);
    expect(await stock(biere)).toBe(62);
    const r = await recevoir(gerant, [{ article_id: biere, conditionnements: 2, par_conditionnement: 12, prix_conditionnement: 8400, prix_vente: 1175 }],
      { fournisseur: brasserie });
    expect(r.alertes.map((x) => x.type)).toEqual(['hausse']);
    const a = await article(biere);
    expect(Number(a.cout_achat)).toBe(700);
    expect(Number(a.prix_vente)).toBe(1175);
    expect(a.unites_par_lot).toBe(12);
    expect(a.nom_lot).toBe('casier');
    const m = await memoire(biere);
    expect(m).toHaveLength(1);
    expect(m[0].utilisations).toBe(2);
    expect(Number(m[0].dernier_prix)).toBe(8400);
  });

  test('le casier de l’article est proposé par défaut ; vente à perte et marge faible signalées', async () => {
    const r = await recevoir(depotier, [
      { article_id: biere, conditionnements: 1, prix_conditionnement: 14400 }, // 1 200 l'unité > 1 175
      { article_id: savon, unites: 10, prix_unitaire: 280 },
    ], { simulation: true });
    expect(r.details[0]).toMatchObject({ par_conditionnement: 12, quantite: 12, cout_unitaire: 1200 });
    expect(r.alertes.find((x) => x.nom === 'Bière 65 cl').type).toBe('hausse');
    expect(r.alertes.some((x) => x.type === 'vente_a_perte' && x.nom === 'Bière 65 cl')).toBe(true);
    expect(r.alertes.find((x) => x.nom === 'Savon')).toMatchObject({ type: 'marge_faible', marge: 6.7 });
  });

  test('sans prix : le coût ne bouge pas ; un article non suivi le devient ; prix à l’unité retenu pour le fournisseur', async () => {
    await recevoir(depotier, [{ article_id: riz, unites: 20 }]);
    expect((await article(riz)).suivi_stock).toBe(true);
    expect(Number((await article(riz)).cout_achat)).toBe(700);
    expect(await memoire(riz)).toHaveLength(0);
    await recevoir(depotier, [{ article_id: riz, unites: 10, prix_unitaire: 720 }], { fournisseur: grossiste });
    const m = await memoire(riz);
    expect(m[0]).toMatchObject({ fournisseur_id: grossiste, nom: 'unité', unites: 1 });
    expect(Number(m[0].dernier_prix)).toBe(720);
    expect(Number((await article(riz)).cout_achat)).toBe(720);
  });

  test('erreurs : rien n’est écrit', async () => {
    const avant = await stock(savon);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 3 }, { article_id: savon, unites: 1 }])).rejects.toThrow(/Ligne 2 : « Savon » apparaît deux fois/);
    await expect(recevoir(depotier, [{ article_id: savon, conditionnements: 2 }])).rejects.toThrow(/combien d'unités contient un conditionnement/);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 0 }])).rejects.toThrow(/supérieure à 0/);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 'x' }])).rejects.toThrow(/illisible/);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 1, prix_vente: 400 }])).rejects.toThrow(/droit de gérer les articles/);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 1 }], { fournisseur: grossiste, paye: 100, mode: 'especes' }))
      .rejects.toThrow(/dépasse le montant/);
    expect(await stock(savon)).toBe(avant);
  });
});

describe('fournisseur et dette', () => {
  test('avec le module Achats : commande reçue, dette, paiement immédiat partiel', async () => {
    const r = await recevoir(gerant, [{ article_id: savon, unites: 100, prix_unitaire: 200 }],
      { fournisseur: grossiste, paye: 5000, mode: 'especes', reference: 'FAC-9' });
    expect(r).toMatchObject({ montant: 20000, paye: 5000, reste_a_payer: 15000 });
    const cmd = (await db.query('select * from commandes_achat where id = $1', [r.commande_achat_id])).rows[0];
    expect(cmd).toMatchObject({ statut: 'recue', fournisseur_id: grossiste, reference_fournisseur: 'FAC-9' });
    expect(Number(cmd.montant_recu)).toBe(20000);
    expect(Number(cmd.montant_paye)).toBe(5000);
    // Un seul mouvement de stock, rattaché aux deux réceptions (pas de double entrée).
    const mvt = (await db.query('select * from mouvements_stock where reception_marchandise_id = $1', [r.id])).rows;
    expect(mvt).toHaveLength(1);
    expect(mvt[0].reception_id).not.toBeNull();
    // La suite habituelle : payer le reste depuis Achats.
    await comme(gerant, "select payer_fournisseur($1, 15000, 'mobile_money')", [r.commande_achat_id]);
  });

  test('le gestionnaire de dépôt reçoit (dette créée) mais ne paie pas ; sans fournisseur pas de paiement', async () => {
    const r = await recevoir(depotier, [{ article_id: savon, unites: 10, prix_unitaire: 200 }], { fournisseur: grossiste });
    expect(r.commande_numero).toMatch(/^BC-/);
    await expect(recevoir(depotier, [{ article_id: savon, unites: 10, prix_unitaire: 200 }], { fournisseur: grossiste, paye: 100, mode: 'especes' }))
      .rejects.toThrow(/Permission refusée : achats.gerer/);
    await expect(recevoir(gerant, [{ article_id: savon, unites: 10, prix_unitaire: 200 }], { paye: 100, mode: 'especes' }))
      .rejects.toThrow(/demande un fournisseur/);
  });

  test('sans le module Achats : bon de réception seul, pas de commande', async () => {
    const four = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etabSansAchats, json({ nom: 'Marché', type: 'fournisseur' })]);
    const art = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etabSansAchats, json({ nom: 'Sucre', prix_vente: 800 })]);
    const r = await recevoir(gerant, [{ article_id: art, unites: 5, prix_unitaire: 600 }], { hub: hubSansAchats, fournisseur: four });
    expect(r.commande_achat_id).toBeNull();
    expect(r.numero).toBe('BR-00001');
  });
});

describe('droits et isolation', () => {
  test('caissier refusé ; autre établissement refusé ; fournisseur d’un autre établissement refusé', async () => {
    await expect(recevoir(caissier, [{ article_id: savon, unites: 1 }])).rejects.toThrow(/Permission refusée/);
    await expect(recevoir(autreGerant, [{ article_id: savon, unites: 1 }])).rejects.toThrow(/Permission refusée/);
    const etranger = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Espion', type: 'fournisseur' })]);
    await expect(recevoir(gerant, [{ article_id: savon, unites: 1 }], { fournisseur: etranger })).rejects.toThrow(/fournisseur actif/);
  });

  test('lecture : le gérant voit ses bons et la mémoire, l’autre établissement ne voit rien ; bon immuable', async () => {
    expect((await comme(gerant, 'select count(*)::int n from receptions_marchandise')).at(0).n).toBeGreaterThan(3);
    expect((await comme(autreGerant, 'select count(*)::int n from receptions_marchandise')).at(0).n).toBe(0);
    expect((await comme(autreGerant, 'select count(*)::int n from conditionnements_articles')).at(0).n).toBe(0);
    await expect(db.query("update receptions_marchandise set notes = 'x'")).rejects.toThrow();
  });

  test('oublier un conditionnement', async () => {
    const [m] = await memoire(biere);
    await expect(comme(caissier, 'select oublier_conditionnement($1)', [m.id])).rejects.toThrow(/Permission refusée/);
    await comme(depotier, 'select oublier_conditionnement($1)', [m.id]);
    expect(await memoire(biere)).toHaveLength(0);
  });
});
