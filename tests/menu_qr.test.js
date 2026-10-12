import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Menu QR des tables : réglages (gérant), menu public (sans compte) avec disponibilité en direct, commande depuis la
// table (désactivée par défaut, anti-abus), prise en caisse (facture en cours de MA caisse) ou en salle, refus,
// isolation ; copie du catalogue vers un autre établissement du même client.
let db;
let sa;
let gerant;
let caissiere;
let autreCaissiere;
let serveur;
let autreGerant;
let etab;
let resto;
let autreEtab;
let soeur;
let hub;
let table4;
let terrasse;
let salleT1;
let biere;
let poulet;
let interne;
let jus;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const json = (v) => JSON.stringify(v);
const jeton = async (id) => (await db.query('select jeton from emplacements_qr where id = $1', [id])).rows[0].jeton;
const commander = (j, p) => anonyme('select commander_par_qr($1, $2::jsonb)', [j, json(p)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@qr.test');
  gerant = await utilisateur('gerant@qr.test');
  caissiere = await utilisateur('awa@qr.test');
  autreCaissiere = await utilisateur('binta@qr.test');
  serveur = await utilisateur('serveur@qr.test');
  autreGerant = await utilisateur('autre@qr.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const client = await valeur(sa, "select creer_client('Groupe QR')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Lounge QR')", [client]);
  soeur = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Lounge QR 2')", [client]);
  resto = await valeur(sa, "select creer_etablissement($1, 'restaurant', 'Resto QR')", [client]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent QR')", [await valeur(sa, "select creer_client('Autre QR')")]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($5, $6, 'gerant'), ($7, $2, 'gerant'), ($8, $2, 'gerant'), ($8, $9, 'serveur')`,
    [etab, gerant, caissiere, autreCaissiere, autreEtab, autreGerant, soeur, resto, serveur],
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  const cat = await valeur(gerant, "select enregistrer_categorie($1, 'Boissons')", [etab]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Bière 65 cl', prix_vente: 1000, cout_achat: 600, categorie_id: cat, reference: 'B65' })]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 3, 'Stock initial', 600)", [hub, biere]);
  poulet = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Poulet braisé', prix_vente: 5000, suivi_stock: false })]);
  interne = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Charbon', prix_vente: 2000, suivi_stock: false })]);
  jus = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Jus', prix_vente: 700, suivi_stock: true })]);
});

afterAll(async () => db.close());

describe('réglages du menu', () => {
  test('seul le gérant règle ; QR codes Table 1 à 5 ; doublon refusé ; un QR code à la main', async () => {
    await expect(comme(caissiere, 'select enregistrer_menu_qr($1, $2::jsonb)', [etab, json({ actif: true })])).rejects.toThrow(/Permission refusée/);
    expect(await valeur(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [etab, json({ de: 1, a: 5 })])).toBe(5);
    expect(await valeur(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [etab, json({ de: 1, a: 6 })])).toBe(1);
    await expect(comme(gerant, 'select enregistrer_emplacement_qr($1, $2::jsonb)', [etab, json({ libelle: 'table 4' })])).rejects.toThrow(/s'appelle déjà/);
    terrasse = await valeur(gerant, 'select enregistrer_emplacement_qr($1, $2::jsonb)', [etab, json({ libelle: 'Terrasse', commande: false })]);
    table4 = (await db.query("select id from emplacements_qr where etablissement_id = $1 and libelle = 'Table 4'", [etab])).rows[0].id;
    expect(await jeton(table4)).toMatch(/^[a-f0-9]{20}$/);
    await expect(comme(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [etab, json({ de: 1, a: 500 })])).rejects.toThrow(/de 1 à 100/);
  });

  test('menu éteint par défaut : rien de public', async () => {
    await expect(anonyme('select menu_public($1)', [await jeton(table4)])).rejects.toThrow(/introuvable ou fermé/);
    await expect(anonyme("select menu_public('00000000000000000000')")).rejects.toThrow(/introuvable ou fermé/);
  });

  test('menu allumé : catégories, prix, disponibilité du stock en direct, articles cachés', async () => {
    await comme(gerant, 'select enregistrer_menu_qr($1, $2::jsonb)', [etab, json({ actif: true, titre: 'Notre carte' })]);
    expect(await valeur(gerant, 'select regler_visibilite_menu($1, $2::uuid[], false)', [etab, [interne]])).toBe(1);
    const m = await anonyme('select menu_public($1)', [await jeton(table4)]);
    expect(m).toMatchObject({ emplacement: 'Table 4', etablissement: 'Lounge QR', titre: 'Notre carte', commande: false, devise: 'XAF' });
    const tous = m.categories.flatMap((c) => c.articles);
    expect(tous.map((a) => a.nom).sort()).toEqual(['Bière 65 cl', 'Jus', 'Poulet braisé']);
    expect(tous.find((a) => a.nom === 'Jus').disponible).toBe(false); // stock 0
    expect(tous.find((a) => a.nom === 'Bière 65 cl')).toMatchObject({ disponible: true, prix: 1000 });
    expect(m.categories.find((c) => c.nom === 'Boissons').articles).toHaveLength(1);
    await comme(gerant, 'select enregistrer_menu_qr($1, $2::jsonb)', [etab, json({ afficher_epuises: false })]);
    const m2 = await anonyme('select menu_public($1)', [await jeton(table4)]);
    expect(m2.categories.flatMap((c) => c.articles).some((a) => a.nom === 'Jus')).toBe(false);
    expect(m2.titre).toBe('Notre carte');
  });

  test('nouveau QR code : l’ancien ne marche plus', async () => {
    const ancien = await jeton(terrasse);
    await anonyme('select menu_public($1)', [ancien]);
    await valeur(gerant, 'select renouveler_jeton_qr($1)', [terrasse]);
    await expect(anonyme('select menu_public($1)', [ancien])).rejects.toThrow(/introuvable/);
  });
});

describe('commande depuis la table', () => {
  let commande;

  test('fermée tant que le gérant ne l’ouvre pas ; jamais sur un QR « consultation seule »', async () => {
    await expect(commander(await jeton(table4), { lignes: [{ article_id: poulet, quantite: 1 }] })).rejects.toThrow(/pas ouverte/);
    await comme(gerant, 'select enregistrer_menu_qr($1, $2::jsonb)', [etab, json({ commandes_actives: true })]);
    await expect(commander(await jeton(terrasse), { lignes: [{ article_id: poulet, quantite: 1 }] })).rejects.toThrow(/pas ouverte/);
  });

  test('prix relus par la base ; article caché, stock insuffisant, quantité folle refusés', async () => {
    const j = await jeton(table4);
    await expect(commander(j, { lignes: [{ article_id: interne, quantite: 1 }] })).rejects.toThrow(/plus sur le menu/);
    await expect(commander(j, { lignes: [{ article_id: biere, quantite: 4 }] })).rejects.toThrow(/plus disponible/);
    await expect(commander(j, { lignes: [{ article_id: poulet, quantite: 99 }] })).rejects.toThrow(/de 1 à 50/);
    await expect(commander(j, { lignes: [] })).rejects.toThrow(/vide/);
    const r = await commander(j, { lignes: [{ article_id: biere, quantite: 2, prix: 1 }, { article_id: poulet, quantite: 1, note: 'bien cuit' }], nom: 'Paul' });
    expect(r).toMatchObject({ numero: 'QR-00001', total: 7000, statut: 'nouvelle' });
    commande = r.id;
    expect(await anonyme('select suivi_commande_qr($1, $2)', [j, commande])).toMatchObject({ statut: 'nouvelle', total: 7000 });
    await expect(anonyme('select suivi_commande_qr($1, $2)', [await jeton(terrasse), commande])).rejects.toThrow(/introuvable/);
    // Les personnes de la caisse sont prévenues (gérant et deux caissières).
    expect((await db.query("select count(*)::int n from notifications where type = 'caisse.commande_qr'")).rows[0].n).toBe(3);
  });

  test('anti-abus : 3 commandes en attente par table', async () => {
    const j = (await db.query("select jeton from emplacements_qr where etablissement_id = $1 and libelle = 'Table 1'", [etab])).rows[0].jeton;
    for (let i = 0; i < 3; i += 1) await commander(j, { lignes: [{ article_id: poulet, quantite: 1 }] });
    await expect(commander(j, { lignes: [{ article_id: poulet, quantite: 1 }] })).rejects.toThrow(/patientez/);
  });

  test('l’anonyme ne lit pas les tables ; l’autre établissement ne voit rien', async () => {
    const lus = await commeRole(db, 'anon', null, (tx) => tx.query('select * from commandes_qr').then((r) => r.rows).catch(() => []));
    expect(lus).toEqual([]);
    expect((await comme(autreGerant, 'select count(*)::int n from commandes_qr')).at(0).n).toBe(0);
    expect((await comme(caissiere, 'select count(*)::int n from commandes_qr')).at(0).n).toBe(4);
    await expect(comme(autreGerant, "select refuser_commande_qr($1, 'non')", [commande])).rejects.toThrow(/Permission refusée/);
  });

  test('prise en caisse : facture en cours de MA caisse ; une seule fois ; pas sur la caisse d’une autre', async () => {
    const session = await valeur(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const sessionBinta = await valeur(autreCaissiere, 'select ouvrir_caisse($1, null, 0)', [etab]);
    await expect(comme(caissiere, "select accepter_commande_qr($1, 'caisse', null)", [commande])).rejects.toThrow(/Ouvrez votre caisse/);
    await expect(comme(caissiere, "select accepter_commande_qr($1, 'caisse', $2)", [commande, sessionBinta])).rejects.toThrow(/autre personne/);
    const r = await valeur(caissiere, "select accepter_commande_qr($1, 'caisse', $2)", [commande, session]);
    const attente = (await db.query('select * from ventes_en_attente where id = $1', [r.vente_en_attente_id])).rows[0];
    expect(attente).toMatchObject({ libelle: 'Table 4 · QR-00001', statut: 'en_attente', session_caisse_id: session });
    expect(attente.lignes).toHaveLength(2);
    expect(Number(attente.total_estime)).toBe(7000);
    await expect(comme(autreCaissiere, "select accepter_commande_qr($1, 'caisse', $2)", [commande, sessionBinta])).rejects.toThrow(/déjà été prise/);
    expect(await anonyme('select suivi_commande_qr($1, $2)', [await jeton(table4), commande])).toMatchObject({ statut: 'acceptee' });
    // Le stock ne bouge pas avant l'encaissement.
    expect(Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [biere])).rows[0].q)).toBe(3);
  });

  test('refus avec motif, visible du client ; salle impossible sans table reliée', async () => {
    const autre = (await db.query("select id from commandes_qr where statut = 'nouvelle' order by numero limit 1")).rows[0].id;
    await expect(comme(caissiere, "select accepter_commande_qr($1, 'salle', null)", [autre])).rejects.toThrow(/Permission refusée/);
    await expect(comme(caissiere, "select refuser_commande_qr($1, '')", [autre])).rejects.toThrow(/pourquoi/);
    await comme(caissiere, "select refuser_commande_qr($1, 'Cuisine fermée')", [autre]);
    const c = (await db.query('select * from commandes_qr where id = $1', [autre])).rows[0];
    expect(c).toMatchObject({ statut: 'refusee', motif_refus: 'Cuisine fermée' });
  });
});

describe('restaurant : QR codes des tables de la Salle', () => {
  test('reprendre les tables ; la commande va sur la table (ouverte au besoin)', async () => {
    const hubR = (await db.query('select id from hubs where etablissement_id = $1 and principal', [resto])).rows[0].id;
    salleT1 = await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [resto, json({ hub_id: hubR, nom: 'T1', zone: 'Salle', places: 4 })]);
    await valeur(gerant, 'select enregistrer_table_restaurant($1, $2::jsonb)', [resto, json({ hub_id: hubR, nom: 'T2', zone: 'Salle', places: 4 })]);
    expect(await valeur(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [resto, json({ depuis_tables: true })])).toBe(2);
    expect(await valeur(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [resto, json({ depuis_tables: true })])).toBe(0);
    await comme(gerant, 'select enregistrer_menu_qr($1, $2::jsonb)', [resto, json({ actif: true, commandes_actives: true })]);
    const plat = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [resto, json({ nom: 'Saka-saka', prix_vente: 3000, suivi_stock: false })]);
    const j = (await db.query('select jeton from emplacements_qr where table_id = $1', [salleT1])).rows[0].jeton;
    const menu = await anonyme('select menu_public($1)', [j]);
    expect(menu).toMatchObject({ emplacement: 'T1', salle: true, commande: true });
    const r = await commander(j, { lignes: [{ article_id: plat, quantite: 2, note: 'piment à part' }], couverts: 3 });
    const pris = await valeur(serveur, "select accepter_commande_qr($1, 'salle', null)", [r.id]);
    const rc = (await db.query('select * from rest_commandes where id = $1', [pris.rest_commande_id])).rows[0];
    expect(rc).toMatchObject({ table_id: salleT1, couverts: 3, statut: 'ouverte' });
    const lignes = (await db.query('select * from rest_lignes where commande_id = $1', [rc.id])).rows;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ libelle: 'Saka-saka', note: 'piment à part' });
    // Deuxième commande de la même table : ajoutée à la commande ouverte.
    const r2 = await commander(j, { lignes: [{ article_id: plat, quantite: 1 }] });
    const pris2 = await valeur(serveur, "select accepter_commande_qr($1, 'salle', null)", [r2.id]);
    expect(pris2.rest_commande_id).toBe(rc.id);
  });
});

describe('copier le catalogue vers un autre établissement du même client', () => {
  test('simulation puis copie : catégories, articles, casier ; jamais le stock ; doublons gardés', async () => {
    await comme(gerant, 'select regler_lot_article($1, 12, $2)', [biere, 'casier']);
    const simul = await valeur(gerant, 'select copier_catalogue($1, $2, false, true)', [etab, soeur]);
    expect(simul).toMatchObject({ simulation: true, categories_creees: 1, articles_crees: 4, articles_deja_presents: 0, cible: 'Lounge QR 2' });
    expect((await db.query('select count(*)::int n from articles where etablissement_id = $1', [soeur])).rows[0].n).toBe(0);
    const r = await valeur(gerant, 'select copier_catalogue($1, $2, false, false)', [etab, soeur]);
    expect(r.articles_crees).toBe(4);
    const copie = (await db.query("select a.*, c.nom categorie from articles a left join categories_articles c on c.id = a.categorie_id where a.etablissement_id = $1 and a.nom = 'Bière 65 cl'", [soeur])).rows[0];
    expect(copie).toMatchObject({ reference: 'B65', unites_par_lot: 12, nom_lot: 'casier', categorie: 'Boissons' });
    expect(Number(copie.prix_vente)).toBe(1000);
    expect((await db.query('select count(*)::int n from mouvements_stock where etablissement_id = $1', [soeur])).rows[0].n).toBe(0);
    expect((await db.query("select visible_menu from articles where etablissement_id = $1 and nom = 'Charbon'", [soeur])).rows[0].visible_menu).toBe(false);
    // Deuxième passage : rien de neuf ; avec mise à jour des prix.
    await comme(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ id: poulet, nom: 'Poulet braisé', prix_vente: 5500, suivi_stock: false })]);
    const r2 = await valeur(gerant, 'select copier_catalogue($1, $2, true, false)', [etab, soeur]);
    expect(r2).toMatchObject({ articles_crees: 0, articles_deja_presents: 4, prix_mis_a_jour: 1, categories_creees: 0 });
  });

  test('refusé vers un autre client, sans le droit, ou vers lui-même', async () => {
    await expect(comme(gerant, 'select copier_catalogue($1, $2, false, true)', [etab, etab])).rejects.toThrow(/deux établissements différents/);
    await expect(comme(gerant, 'select copier_catalogue($1, $2, false, true)', [etab, autreEtab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select copier_catalogue($1, $2, false, true)', [etab, autreEtab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(caissiere, 'select copier_catalogue($1, $2, false, true)', [soeur, etab])).rejects.toThrow(/Permission refusée/);
  });
});
