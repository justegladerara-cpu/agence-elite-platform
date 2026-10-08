import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Modules complémentaires : un établissement « commerce » reçoit Salle, Serveurs et Cuisine par sa licence,
// sans changer de solution ni perdre ses données ; accordé seulement par Agence Elite, avec motif et dépendances.
let db;
let sa;
let gerant;
let serveur;
let serveur2;
let cuisinier;
let autreGerant;
let etab;
let autreEtab;
let savon;
let venteAvant;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const un = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const actifs = async (e) => (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [e])).rows.map((r) => r.module_id);
const stockDe = async (article) => Number((await un('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).q);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@complement.test');
  gerant = await utilisateur('gerant@complement.test');
  serveur = await utilisateur('paul@complement.test');
  serveur2 = await utilisateur('nadia@complement.test');
  cuisinier = await utilisateur('cuisine@complement.test');
  autreGerant = await utilisateur('autre@complement.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Client Comptoir')");
  const c2 = await valeur(sa, "select creer_client('Client Voisin')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Comptoir Complément')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Comptoir Voisin')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'serveur'), ($1, $4, 'serveur'), ($1, $5, 'cuisinier'), ($6, $7, 'gerant')`,
    [etab, gerant, serveur, serveur2, cuisinier, autreEtab, autreGerant]
  );
  await db.query("update profils set nom_complet = 'Paul', nom_affiche = null where id = $1", [serveur]);
  // Activité commerce existante avant le complément : un article suivi en stock et une vente.
  savon = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Savon fictif', prix_vente: 750, stock_initial: 10 })]);
  const session = await valeur(gerant, 'select ouvrir_caisse($1)', [etab]);
  venteAvant = (await comme(gerant, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb) v',
    [etab, session, json([{ article_id: savon, quantite: 2 }]), json([{ mode: 'especes', montant: 1500 }])]))[0].v;
});

afterAll(async () => db.close());

describe('accorder des modules d’une autre solution', () => {
  test('au départ, Salle et Cuisine sont absents et ne s’activent pas en direct', async () => {
    const avant = await actifs(etab);
    expect(avant).not.toContain('restaurant_salle');
    await expect(db.query("insert into etablissement_modules(etablissement_id, module_id, actif) values ($1, 'restaurant_salle', true)", [etab]))
      .rejects.toThrow(/pas proposé|pas compris dans la licence/);
    const liste = await valeur(sa, 'select modules_complementaires_etablissement($1)', [etab]);
    const salle = liste.modules.find((m) => m.id === 'restaurant_salle');
    expect(salle).toMatchObject({ accorde: false, actif: false });
    expect(salle.depend_de).toEqual(['articles', 'caisse']);
    expect(liste.modules.some((m) => m.nature === 'socle')).toBe(false);
  });

  test('le client ne peut pas s’accorder un module ; un motif est obligatoire', async () => {
    await expect(comme(gerant, "select accorder_module($1, 'restaurant_salle', true, 'Moi-même')", [etab])).rejects.toThrow(/réservée/);
    await expect(comme(sa, "select accorder_module($1, 'restaurant_salle', true)", [etab])).rejects.toThrow(/motif est obligatoire/);
    await expect(comme(sa, "select accorder_module($1, 'restaurant_salle', true, '  ')", [etab])).rejects.toThrow(/motif est obligatoire/);
    await expect(comme(sa, "select accorder_module($1, 'hotel_chambres_inconnu', true, 'x')", [etab])).rejects.toThrow(/ne peut pas être accordé/);
  });

  test('Cuisine accordée → Salle ajoutée par dépendance, tout s’active, tarif de l’option tracé', async () => {
    await comme(sa, 'select enregistrer_option_module($1, $2::jsonb)', ['restaurant_cuisine', json({ prix_mensuel: 5000, prix_mise_en_service: 1000 })]);
    await expect(comme(gerant, 'select enregistrer_option_module($1, $2::jsonb)', ['restaurant_cuisine', json({ prix_mensuel: 0 })])).rejects.toThrow();
    await comme(sa, "select accorder_module($1, 'restaurant_cuisine', true, 'Option restaurant signée')", [etab]);
    const apres = await actifs(etab);
    expect(apres).toEqual(expect.arrayContaining(['restaurant_salle', 'restaurant_cuisine', 'caisse', 'articles', 'stock']));
    const licence = await un("select modules_supplementaires from licences where etablissement_id = $1 and statut <> 'terminee'", [etab]);
    expect(licence.modules_supplementaires).toEqual(expect.arrayContaining(['restaurant_salle', 'restaurant_cuisine']));
    expect((await un('select solution_id from etablissements where id = $1', [etab])).solution_id).toBe('commerce');
    const ev = await un("select motif, montant from licence_evenements where etablissement_id = $1 and motif like '%complémentaire%' order by cree_le desc limit 1", [etab]);
    expect(ev.motif).toMatch(/restaurant_cuisine/);
    expect(ev.motif).toMatch(/Option restaurant signée/);
    expect(Number(ev.montant)).toBeGreaterThan(0);
    const liste = await valeur(sa, 'select modules_complementaires_etablissement($1)', [etab]);
    expect(liste.modules.find((m) => m.id === 'restaurant_salle')).toMatchObject({ accorde: true, actif: true });
    expect(liste.historique.length).toBeGreaterThan(0);
    const fiche = await valeur(sa, 'select editeur_etablissement($1)', [etab]);
    expect(fiche.modules_complementaires.modules.length).toBeGreaterThan(0);
    // L'autre établissement n'est pas touché.
    expect(await actifs(autreEtab)).not.toContain('restaurant_salle');
  });

  test('les données commerce d’avant restent intactes', async () => {
    expect((await un('select statut, total from ventes where id = $1', [venteAvant.vente_id])).statut).toBe('validee');
    expect(await stockDe(savon)).toBe(8);
  });

  test('parcours restaurant complet sur l’établissement commerce', async () => {
    const hub = (await un('select id from hubs where etablissement_id = $1 and principal', [etab])).id;
    const table = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T1', places: 4 })]);
    const plat = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Poulet braisé', prix_vente: 7000, suivi_stock: false })]);
    const jus = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Jus maison', prix_vente: 1500, suivi_stock: false })]);
    await comme(gerant, "select definir_poste_preparation($1, 'cuisine')", [plat]);
    await comme(gerant, "select definir_poste_preparation($1, 'bar')", [jus]);
    await comme(gerant, "select affecter_serveur_table($1, $2, 'Service du soir')", [table, serveur]);
    const commande = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table, couverts: 2 })]);
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: plat, quantite: 1 }, { article_id: jus, quantite: 2 }])]);
    expect(await valeur(serveur, 'select envoyer_commande_restaurant($1)', [commande])).toBe(2);
    await expect(comme(serveur, "select transferer_serveur_commande($1, $2, 'Relève')", [commande, serveur2])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select transferer_serveur_commande($1, $2, 'Relève de Paul')", [commande, serveur2]);
    await comme(gerant, "select transferer_serveur_commande($1, $2, 'Retour de Paul')", [commande, serveur]);
    for (const l of (await db.query('select id from rest_lignes where commande_id = $1', [commande])).rows) {
      await comme(cuisinier, "select avancer_ligne_restaurant($1, 'prete')", [l.id]);
      await comme(serveur, "select avancer_ligne_restaurant($1, 'servie')", [l.id]);
    }
    const session = await valeur(gerant, 'select ouvrir_caisse($1)', [etab]).catch(async () =>
      (await un("select id from sessions_caisse where etablissement_id = $1 and statut = 'ouverte' order by ouverte_le desc limit 1", [etab])).id);
    const r = (await comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb) r', [commande, session, json([{ mode: 'especes', montant: 10000 }])]))[0].r;
    expect(Number(r.total)).toBe(10000);
    expect(r.commande_close).toBe(true);
    const stats = await valeur(gerant, 'select statistiques_serveurs_restaurant($1)', [etab]);
    expect(stats.serveurs.find((s) => s.serveur_id === serveur)).toMatchObject({ commandes_cloturees: 1, couverts: 2 });
    await expect(comme(autreGerant, 'select statistiques_serveurs_restaurant($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'Intrus' })])).rejects.toThrow();
  });

  test('retirer : dépendance protégée, puis désactivation sans perte ; réactiver retrouve tout', async () => {
    await expect(comme(sa, "select accorder_module($1, 'restaurant_salle', false, 'Fin')", [etab])).rejects.toThrow(/dépend/);
    const tablesAvant = Number((await un('select count(*) n from rest_tables where etablissement_id = $1', [etab])).n);
    await comme(sa, "select accorder_module($1, 'restaurant_cuisine', false, 'Résiliation option')", [etab]);
    await comme(sa, "select accorder_module($1, 'restaurant_salle', false, 'Résiliation option')", [etab]);
    expect(await actifs(etab)).not.toContain('restaurant_salle');
    expect(await actifs(etab)).toContain('caisse');
    expect(Number((await un('select count(*) n from rest_tables where etablissement_id = $1', [etab])).n)).toBe(tablesAvant);
    await comme(sa, "select accorder_module($1, 'restaurant_cuisine', true, 'Reprise de l’option')", [etab]);
    expect(await actifs(etab)).toEqual(expect.arrayContaining(['restaurant_salle', 'restaurant_cuisine']));
    expect(Number((await un('select count(*) n from rest_tables where etablissement_id = $1', [etab])).n)).toBe(tablesAvant);
  });

  test('anonyme refusé', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select accorder_module($1, 'restaurant_salle', true, 'x')", [etab]))).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select modules_complementaires_etablissement($1)', [etab]))).rejects.toThrow(/permission denied/);
  });
});
