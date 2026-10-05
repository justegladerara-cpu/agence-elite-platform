import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { appliquerMigrations, commeRole, creerBase } from './helpers/db.js';

// Restaurant en service réel : catégories administrables, disponibilité, serveurs affectés aux tables
// (historique, commandes, transferts), statistiques par serveur, import dédoublonné, parcours complet,
// permissions, Hubs et isolation entre établissements.
let db;
let sa;
let gerant;
let responsableHub;
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
let plat;
let boisson;
let session;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const un = async (sql, params = []) => (await db.query(sql, params)).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@service.test');
  gerant = await utilisateur('gerant@service.test');
  responsableHub = await utilisateur('rhub@service.test');
  serveur = await utilisateur('paul@service.test');
  serveur2 = await utilisateur('nadia@service.test');
  cuisinier = await utilisateur('cuisine@service.test');
  lecteur = await utilisateur('lecteur@service.test');
  autreGerant = await utilisateur('autre@service.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Client Service')");
  const c2 = await valeur(sa, "select creer_client('Client Voisin')");
  etab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Restaurant Service')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Restaurant Voisin')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'responsable_hub'), ($1, $4, 'serveur'), ($1, $5, 'serveur'), ($1, $6, 'cuisinier'),
     ($1, $7, 'lecteur'), ($8, $9, 'gerant')`,
    [etab, gerant, responsableHub, serveur, serveur2, cuisinier, lecteur, autreEtab, autreGerant]
  );
  await db.query("update profils set nom_complet = 'Paul', nom_affiche = null where id = $1", [serveur]);
  await db.query("update profils set nom_complet = 'Nadia', nom_affiche = null where id = $1", [serveur2]);
  hub = (await un('select id from hubs where etablissement_id = $1 and principal', [etab])).id;
  terrasse = await valeur(gerant, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Terrasse' })]);
  await comme(gerant, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, serveur2, [terrasse]]);
  table1 = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T1', places: 4 })]);
  table2 = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: hub, nom: 'T2', places: 2 })]);
  tableTerrasse = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ hub_id: terrasse, nom: 'B1', zone: 'Terrasse' })]);
});

afterAll(async () => db.close());

describe('catégories d’articles', () => {
  let boissons;
  let cuisine;
  let desserts;

  test('création, ordre automatique, doublon (casse comprise) refusé, droits', async () => {
    boissons = await valeur(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Boissons', description: 'Bar' })]);
    cuisine = await valeur(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Cuisine' })]);
    desserts = await valeur(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Desserts' })]);
    const ordres = (await db.query('select nom, ordre, description from categories_articles where etablissement_id = $1 order by ordre', [etab])).rows;
    expect(ordres.map((c) => c.nom)).toEqual(['Boissons', 'Cuisine', 'Desserts']);
    expect(ordres[0].description).toBe('Bar');
    await expect(comme(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'boissons' })])).rejects.toThrow(/existe déjà/);
    await expect(comme(serveur, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Pirate' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(lecteur, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Pirate' })])).rejects.toThrow(/Permission refusée/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ nom: 'Anonyme' })])))
      .rejects.toThrow(/permission denied/);
  });

  test('renommer, décrire, désactiver, réordonner ; une catégorie d’un autre établissement est hors d’atteinte', async () => {
    await comme(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ id: cuisine, nom: 'Plats', description: 'Cuisine chaude' })]);
    expect(await un('select nom, description from categories_articles where id = $1', [cuisine])).toEqual({ nom: 'Plats', description: 'Cuisine chaude' });
    await comme(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ id: desserts, nom: 'Desserts', actif: false })]);
    expect((await un('select actif from categories_articles where id = $1', [desserts])).actif).toBe(false);
    expect(await valeur(gerant, 'select ordonner_categories_articles($1, $2::uuid[])', [etab, [cuisine, boissons, desserts]])).toBe(3);
    expect((await db.query('select nom from categories_articles where etablissement_id = $1 order by ordre', [etab])).rows.map((c) => c.nom))
      .toEqual(['Plats', 'Boissons', 'Desserts']);
    await expect(comme(autreGerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [autreEtab, json({ id: cuisine, nom: 'Volée' })]))
      .rejects.toThrow(/introuvable dans cet établissement/);
    await expect(comme(autreGerant, 'select ordonner_categories_articles($1, $2::uuid[])', [autreEtab, [cuisine]])).rejects.toThrow(/inconnue/);
    await expect(comme(autreGerant, 'select archiver_categorie_article($1)', [cuisine])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from categories_articles where id = $1', [cuisine])).toEqual([]);
  });

  test('déplacement en masse, puis archivage contrôlé : jamais de catégorie pleine archivée en silence', async () => {
    plat = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Poulet braisé', prix_vente: 7000, suivi_stock: false, categorie_id: boissons })]);
    boisson = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Jus maison', prix_vente: 1500, suivi_stock: false, categorie_id: boissons })]);
    await comme(gerant, "select definir_poste_preparation($1, 'cuisine')", [plat]);
    await comme(gerant, "select definir_poste_preparation($1, 'bar')", [boisson]);
    expect(await valeur(gerant, 'select deplacer_articles_categorie($1, $2::uuid[], $3)', [etab, [plat], cuisine])).toBe(1);
    expect((await un('select categorie_id from articles where id = $1', [plat])).categorie_id).toBe(cuisine);
    await expect(comme(serveur, 'select deplacer_articles_categorie($1, $2::uuid[], $3)', [etab, [plat], boissons])).rejects.toThrow(/Permission refusée/);
    const autreArticle = await valeur(autreGerant, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Étranger', prix_vente: 1, suivi_stock: false })]);
    await expect(comme(gerant, 'select deplacer_articles_categorie($1, $2::uuid[], $3)', [etab, [autreArticle], cuisine])).rejects.toThrow(/Article inconnu/);
    expect((await un("select count(*)::int n from evenements where etablissement_id = $1 and type = 'articles.deplacement_categorie'", [etab])).n).toBe(1);

    await expect(comme(gerant, 'select archiver_categorie_article($1)', [boissons])).rejects.toThrow(/contient 1 article\(s\) en vente/);
    expect(await valeur(gerant, 'select archiver_categorie_article($1, $2)', [boissons, desserts])).toBe(1);
    const archivee = await un('select actif, archivee_le from categories_articles where id = $1', [boissons]);
    expect(archivee.actif).toBe(false);
    expect(archivee.archivee_le).not.toBeNull();
    expect((await un('select categorie_id from articles where id = $1', [boisson])).categorie_id).toBe(desserts);
    await expect(comme(gerant, 'select deplacer_articles_categorie($1, $2::uuid[], $3)', [etab, [boisson], boissons])).rejects.toThrow(/archivée/);
    await expect(comme(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, json({ id: boissons, nom: 'Boissons' })])).rejects.toThrow(/restaurez-la/);
    await comme(gerant, 'select restaurer_categorie_article($1)', [boissons]);
    expect(await un('select actif, archivee_le from categories_articles where id = $1', [boissons])).toEqual({ actif: true, archivee_le: null });
    expect(await valeur(gerant, 'select deplacer_articles_categorie($1, $2::uuid[], $3)', [etab, [boisson], boissons])).toBe(1);
    // Archivage d'une catégorie vide, restauration par la création rapide de la fiche article.
    await comme(gerant, 'select archiver_categorie_article($1)', [desserts]);
    expect(await valeur(gerant, "select enregistrer_categorie($1, 'DESSERTS')", [etab])).toBe(desserts);
    expect(await un('select actif, archivee_le from categories_articles where id = $1', [desserts])).toEqual({ actif: true, archivee_le: null });
  });

  test('les opérations sur les catégories sont journalisées', async () => {
    const audit = (await db.query("select operation from journal_audit where table_nom = 'categories_articles' and etablissement_id = $1", [etab])).rows;
    expect(audit.length).toBeGreaterThanOrEqual(8);
    expect(audit.some((a) => a.operation === 'UPDATE')).toBe(true);
  });
});

describe('disponibilité des articles', () => {
  test('cuisinier ou gérant marquent épuisé ; le serveur ne peut ni le faire ni commander un article épuisé', async () => {
    await expect(comme(serveur, 'select definir_disponibilite_article($1, true, true)', [boisson])).rejects.toThrow(/Permission refusée/);
    await comme(cuisinier, 'select definir_disponibilite_article($1, true, true)', [boisson]);
    const c = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table2, couverts: 1 })]);
    await expect(comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [c, json([{ article_id: boisson, quantite: 1 }])])).rejects.toThrow(/épuisé/);
    await comme(gerant, 'select definir_disponibilite_article($1, false, false)', [boisson]);
    await expect(comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [c, json([{ article_id: boisson, quantite: 1 }])])).rejects.toThrow(/indisponible/);
    await comme(gerant, 'select definir_disponibilite_article($1, true, false)', [boisson]);
    await comme(gerant, "select annuler_commande_restaurant($1, 'Test disponibilité')", [c]);
  });
});

describe('serveur affecté à une table', () => {
  let commande;

  test('liste des serveurs possibles : membres ayant le droit de servir, sans e-mail', async () => {
    const liste = await valeur(serveur, 'select serveurs_restaurant($1)', [etab]);
    const noms = liste.map((s) => s.nom);
    expect(noms).toEqual(expect.arrayContaining(['Paul', 'Nadia']));
    expect(JSON.stringify(liste)).not.toMatch(/@service\.test/);
    expect(liste.find((s) => s.nom === 'Nadia').hubs).toEqual([terrasse]);
    await expect(comme(autreGerant, 'select serveurs_restaurant($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('affectation par le responsable ; refus pour un serveur, un cuisinier, un Hub non autorisé, un autre établissement', async () => {
    await expect(comme(serveur, 'select affecter_serveur_table($1, $2)', [table1, serveur])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select affecter_serveur_table($1, $2)', [table1, cuisinier])).rejects.toThrow(/ne peut pas servir/);
    await expect(comme(gerant, 'select affecter_serveur_table($1, $2)', [table1, serveur2])).rejects.toThrow(/ne peut pas servir/);
    await expect(comme(gerant, 'select affecter_serveur_table($1, $2)', [table1, autreGerant])).rejects.toThrow(/ne peut pas servir/);
    await expect(comme(autreGerant, 'select affecter_serveur_table($1, $2)', [table1, serveur])).rejects.toThrow(/Permission refusée/);
    const a = await valeur(responsableHub, "select affecter_serveur_table($1, $2, 'Service du midi')", [table1, serveur]);
    expect((await un('select motif from rest_affectations where id = $1', [a])).motif).toBe('Service du midi');
    expect(await valeur(gerant, 'select affecter_serveur_table($1, $2)', [table1, serveur])).toBe(a);
    await comme(gerant, 'select affecter_serveur_table($1, $2)', [tableTerrasse, serveur2]);
    const notif = await un("select count(*)::int n from notifications where user_id = $1 and type = 'restaurant.affectation'", [serveur]);
    expect(notif.n).toBe(1);
  });

  test('la commande ouverte prend le serveur affecté, même ouverte par un autre ; pris_par garde l’auteur', async () => {
    commande = await valeur(gerant, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 3 })]);
    const c = await un('select serveur_id, pris_par from rest_commandes where id = $1', [commande]);
    expect(c).toEqual({ serveur_id: serveur, pris_par: gerant });
  });

  test('changer le serveur de la table : historique conservé, la commande garde son serveur d’origine', async () => {
    await comme(gerant, "select affecter_serveur_table($1, $2, 'Relève du soir')", [table1, responsableHub]);
    const historique = (await db.query('select serveur_id, fin, terminee_par, motif_fin, affectee_par from rest_affectations where table_id = $1 order by debut', [table1])).rows;
    expect(historique).toHaveLength(2);
    expect(historique[0]).toMatchObject({ serveur_id: serveur, terminee_par: gerant, motif_fin: 'Relève du soir', affectee_par: responsableHub });
    expect(historique[0].fin).not.toBeNull();
    expect(historique[1]).toMatchObject({ serveur_id: responsableHub, fin: null });
    expect((await un('select serveur_id from rest_commandes where id = $1', [commande])).serveur_id).toBe(serveur);
    await expect(db.query('update rest_affectations set serveur_id = $1 where table_id = $2 and fin is not null', [serveur2, table1])).rejects.toThrow(/terminée ne change plus/);
    await expect(db.query('delete from rest_affectations where table_id = $1', [table1])).rejects.toThrow();
  });

  test('transfert de commande : droit dédié, motif obligatoire, trace immuable, notification', async () => {
    await expect(comme(serveur, "select transferer_serveur_commande($1, $2, 'Je pars')", [commande, responsableHub])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select transferer_serveur_commande($1, $2, '  ')", [commande, responsableHub])).rejects.toThrow(/motif/);
    await expect(comme(gerant, "select transferer_serveur_commande($1, $2, 'Même')", [commande, serveur])).rejects.toThrow(/autre serveur/);
    await expect(comme(gerant, "select transferer_serveur_commande($1, $2, 'Hub')", [commande, serveur2])).rejects.toThrow(/ne peut pas servir/);
    await comme(gerant, "select transferer_serveur_commande($1, $2, 'Fin de service de Paul')", [commande, responsableHub]);
    expect((await un('select serveur_id from rest_commandes where id = $1', [commande])).serveur_id).toBe(responsableHub);
    const t = await un('select ancien_serveur_id, nouveau_serveur_id, motif, transfere_par from rest_transferts_serveur where commande_id = $1', [commande]);
    expect(t).toEqual({ ancien_serveur_id: serveur, nouveau_serveur_id: responsableHub, motif: 'Fin de service de Paul', transfere_par: gerant });
    await expect(db.query("update rest_transferts_serveur set motif = 'x' where commande_id = $1", [commande])).rejects.toThrow();
    // Retour au serveur d'origine pour la suite du parcours.
    await comme(gerant, "select transferer_serveur_commande($1, $2, 'Retour de Paul')", [commande, serveur]);
    expect((await un('select count(*)::int n from rest_transferts_serveur where commande_id = $1', [commande])).n).toBe(2);
  });

  test('retrait d’affectation ; table retirée = affectation terminée ; à emporter sans table, au nom de qui la prend', async () => {
    await comme(gerant, 'select retirer_serveur_table($1)', [table1]);
    await expect(comme(gerant, 'select retirer_serveur_table($1)', [table1])).rejects.toThrow(/Aucun serveur/);
    expect((await un('select count(*)::int n from rest_affectations where table_id = $1 and fin is null', [table1])).n).toBe(0);
    await comme(gerant, 'select affecter_serveur_table($1, $2)', [table2, serveur]);
    await comme(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ id: table2, hub_id: hub, nom: 'T2', actif: false })]);
    expect((await un('select motif_fin from rest_affectations where table_id = $1', [table2])).motif_fin).toBe('Table retirée');
    await comme(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [etab, json({ id: table2, hub_id: hub, nom: 'T2', actif: true })]);
    const emporter = await valeur(serveur2, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ hub_id: terrasse, nom_client: 'Awa' })]);
    expect(await un('select table_id, type, serveur_id, pris_par from rest_commandes where id = $1', [emporter]))
      .toEqual({ table_id: null, type: 'a_emporter', serveur_id: serveur2, pris_par: serveur2 });
    expect((await un('select count(*)::int n from rest_tables where etablissement_id = $1', [etab])).n).toBe(3);
    await comme(serveur2, "select annuler_commande_restaurant($1, 'Client parti')", [emporter]).catch(() => null);
  });

  test('lecture : un autre établissement ne voit ni affectations ni transferts ; anon rien', async () => {
    expect(await comme(autreGerant, 'select id from rest_affectations')).toEqual([]);
    expect(await comme(autreGerant, 'select id from rest_transferts_serveur')).toEqual([]);
    expect((await comme(serveur, 'select id from rest_affectations')).length).toBeGreaterThan(0);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from rest_affectations'))).rows).toEqual([]);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from rest_transferts_serveur'))).rows).toEqual([]);
    // Nadia (Hub Terrasse seulement) ne lit pas les affectations du Hub principal.
    const lues = await comme(serveur2, 'select hub_id from rest_affectations');
    expect(lues.every((r) => r.hub_id === terrasse)).toBe(true);
  });

  test('parcours complet : plats et boissons → cuisine et bar → caisse → vente → statistiques du serveur', async () => {
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [commande, json([{ article_id: plat, quantite: 2 }, { article_id: boisson, quantite: 3 }])]);
    expect(await valeur(serveur, 'select envoyer_commande_restaurant($1)', [commande])).toBe(2);
    const lignes = (await db.query('select id, poste, statut from rest_lignes where commande_id = $1 order by poste', [commande])).rows;
    expect(lignes.map((l) => [l.poste, l.statut])).toEqual([['bar', 'envoyee'], ['cuisine', 'envoyee']]);
    const dash = await valeur(gerant, 'select tableau_de_bord_restaurant($1)', [etab]);
    expect(dash.postes).toEqual({ cuisine: 1, bar: 1 });
    for (const l of lignes) {
      await comme(cuisinier, "select avancer_ligne_restaurant($1, 'prete')", [l.id]);
      await comme(serveur, "select avancer_ligne_restaurant($1, 'servie')", [l.id]);
    }
    session = await valeur(gerant, 'select ouvrir_caisse($1)', [etab]);
    const r = (await comme(serveur, 'select encaisser_commande_restaurant($1, $2, $3::jsonb) r',
      [commande, session, json([{ mode: 'especes', montant: 18500 }])]))[0].r;
    expect(Number(r.total)).toBe(18500);
    expect(r.commande_close).toBe(true);
    const vente = await un('select origine, statut, total from ventes where id = $1', [r.vente_id]);
    expect(vente).toMatchObject({ origine: 'restaurant', statut: 'validee' });
    const tb = await valeur(gerant, 'select tableau_de_bord_restaurant($1)', [etab]);
    expect(Number(tb.chiffre_jour)).toBe(18500);
    expect(Number(tb.encaisse_jour)).toBe(18500);
    expect(Number(tb.ticket_moyen)).toBe(18500);

    const tous = await valeur(gerant, 'select statistiques_serveurs_restaurant($1)', [etab]);
    expect(tous.tous).toBe(true);
    const paul = tous.serveurs.find((s) => s.serveur_id === serveur);
    expect(paul).toMatchObject({ nom: 'Paul', commandes_cloturees: 1, couverts: 3, additions: 1, tables_servies: 1 });
    expect(Number(paul.chiffre_affaires)).toBe(18500);
    expect(Number(paul.encaisse)).toBe(18500);
    expect(Number(paul.ticket_moyen)).toBe(18500);
    const siens = await valeur(serveur, 'select statistiques_serveurs_restaurant($1)', [etab]);
    expect(siens.tous).toBe(false);
    expect(siens.serveurs.every((s) => s.serveur_id === serveur)).toBe(true);
    const nadia = await valeur(serveur2, 'select statistiques_serveurs_restaurant($1)', [etab]);
    expect(nadia.serveurs.every((s) => s.serveur_id === serveur2)).toBe(true);
    await expect(comme(autreGerant, 'select statistiques_serveurs_restaurant($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select statistiques_serveurs_restaurant($1, '2026-01-02', '2026-01-01')", [etab])).rejects.toThrow(/Période invalide/);
  });

  test('le libellé du plat porte la variante (vin à deux tarifs)', async () => {
    await comme(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json([
      { reference: 'V-1', nom: 'Vin rouge', variante: 'Tarif 1', prix_vente: 5000, categorie: 'Vins', poste_preparation: 'bar' },
      { reference: 'V-2', nom: 'Vin rouge', variante: 'Tarif 2', prix_vente: 18000, categorie: 'Vins', poste_preparation: 'bar' },
    ])]);
    const v2 = (await un("select id from articles where etablissement_id = $1 and reference = 'V-2'", [etab])).id;
    const c = await valeur(serveur, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [etab, json({ table_id: table1, couverts: 2 })]);
    await comme(serveur, 'select ajouter_lignes_restaurant($1, $2::jsonb)', [c, json([{ article_id: v2, quantite: 1 }])]);
    expect((await un('select libelle from rest_lignes where commande_id = $1', [c])).libelle).toBe('Vin rouge — Tarif 2');
  });
});

describe('import de catalogue dédoublonné', () => {
  test('réutilise un article saisi à la main (même désignation, accents et casse ignorés), garde son stock', async () => {
    const cat = await valeur(gerant, "select enregistrer_categorie($1, 'Bières')", [etab]);
    const corona = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Coróna', prix_vente: 1800, suivi_stock: true, categorie_id: cat })]);
    const lignes = [
      { reference: 'B-1', nom: 'Corona', prix_vente: 2000, categorie: 'bières', poste_preparation: 'bar' },
      { reference: 'B-2', nom: 'Leffe', prix_vente: 2000, categorie: 'Bières', poste_preparation: 'bar' },
      { reference: 'B-3', nom: 'Sodabi', categorie: 'Traditionnelles', actif: 'non', motif_attente: 'Prix non fourni' },
    ];
    const apercu = await valeur(gerant, 'select importer_catalogue($1, $2::jsonb, true)', [etab, json(lignes)]);
    expect(apercu).toMatchObject({ simulation: true, crees: 1, reutilises: 1, attente: 1, categories_creees: 0, categories_reutilisees: 1 });
    expect(apercu.etablissement).toMatchObject({ id: etab, nom: 'Restaurant Service', client: 'Client Service' });
    expect(apercu.details.find((d) => d.action === 'reutiliser')).toMatchObject({ reference: 'B-1', prix: 2000, ancien_prix: 1800 });
    expect((await un('select reference from articles where id = $1', [corona])).reference).toBeNull();
    const reel = await valeur(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json(lignes)]);
    expect(reel).toMatchObject({ crees: 1, reutilises: 1, attente: 1 });
    expect(await un('select reference, prix_vente, suivi_stock from articles where id = $1', [corona])).toEqual({ reference: 'B-1', prix_vente: '2000.00', suivi_stock: true });
    expect((await un("select count(*)::int n from articles where etablissement_id = $1 and nom ilike 'sodabi'", [etab])).n).toBe(0);
    expect(await valeur(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json(lignes)])).toMatchObject({ crees: 0, modifies: 0, reutilises: 0, inchanges: 2 });
    expect((await un("select count(*)::int n from evenements where etablissement_id = $1 and type = 'articles.import_catalogue'", [etab])).n).toBe(3);
    expect((await un('select count(*)::int n from mouvements_stock where article_id = $1', [corona])).n).toBe(0);
  });

  test('références en double, poste inconnu, mauvais établissement et droits refusés ; rien n’est écrit', async () => {
    const avant = (await un('select count(*)::int n from articles where etablissement_id = $1', [etab])).n;
    await expect(comme(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json([{ reference: 'X', nom: 'A', prix_vente: 1 }, { reference: 'X', nom: 'B', prix_vente: 2 }])]))
      .rejects.toThrow(/plusieurs fois/);
    await expect(comme(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json([{ reference: 'Y', nom: 'A', prix_vente: 1 }, { reference: 'Z', nom: 'B', prix_vente: 2, poste_preparation: 'terrasse' }])]))
      .rejects.toThrow(/Ligne 2 : poste inconnu/);
    expect((await un('select count(*)::int n from articles where etablissement_id = $1', [etab])).n).toBe(avant);
    await expect(comme(gerant, 'select importer_catalogue($1, $2::jsonb, true)', [autreEtab, json([{ reference: 'Q', nom: 'Q', prix_vente: 1 }])])).rejects.toThrow(/Permission refusée/);
    await expect(comme(serveur, 'select importer_catalogue($1, $2::jsonb, true)', [etab, json([{ reference: 'Q', nom: 'Q', prix_vente: 1 }])])).rejects.toThrow(/Permission refusée/);
  });

  test('deux lignes de même désignation dans des catégories différentes restent deux articles (Mojito)', async () => {
    const r = await valeur(gerant, 'select importer_catalogue($1, $2::jsonb, false)', [etab, json([
      { reference: 'M-1', nom: 'Mojito', prix_vente: 5000, categorie: 'Cocktails sans alcool' },
      { reference: 'M-2', nom: 'Mojito', prix_vente: 6500, categorie: 'Cocktails alcoolisés' },
    ])]);
    expect(r).toMatchObject({ crees: 2, categories_creees: 2 });
    expect(r.avertissements).toEqual([]);
  });
});

describe('migration sur une base déjà en service', () => {
  test('les commandes et catégories existantes sont conservées ; pris_par est rempli', async () => {
    const ancienne = await creerBase({ jusqua: '20261005000001' });
    const q = async (sql, params = []) => (await ancienne.query(sql, params)).rows;
    const u = async (email) => (await q('insert into auth.users(email) values($1) returning id', [email]))[0].id;
    const sa2 = await u('sa@ancien.test');
    const g = await u('g@ancien.test');
    await q("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa2]);
    const viaRole = (user, sql, params = []) => commeRole(ancienne, 'authenticated', user, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);
    const cl = await viaRole(sa2, "select creer_client('Ancien')");
    const e = await viaRole(sa2, "select creer_etablissement($1, 'restaurant', 'Ancien Resto')", [cl]);
    await q("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant')", [e, g]);
    const h = (await q('select id from hubs where etablissement_id = $1', [e]))[0].id;
    await viaRole(g, "select enregistrer_categorie($1, 'Ancienne catégorie')", [e]);
    const t = await viaRole(g, 'select enregistrer_table_restaurant($1, $2::jsonb)', [e, json({ hub_id: h, nom: 'A1' })]);
    const c = await viaRole(g, 'select ouvrir_commande_restaurant($1, $2::jsonb)', [e, json({ table_id: t, couverts: 2 })]);
    await appliquerMigrations(ancienne, { depuis: '20261005000001' });
    expect((await q('select serveur_id, pris_par, statut from rest_commandes where id = $1', [c]))[0]).toEqual({ serveur_id: g, pris_par: g, statut: 'ouverte' });
    expect((await q('select nom, actif, archivee_le from categories_articles where etablissement_id = $1', [e]))[0]).toEqual({ nom: 'Ancienne catégorie', actif: true, archivee_le: null });
    await ancienne.close();
  });
});
