import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Hôtel : types, chambres, entretien, réservations sans surréservation, arrivée, prestations, départ facturé, droits.
let db;
let sa;
let gerant;
let reception;
let menage;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let standard;
let suite;
let ch101;
let ch102;
let ch201;
let client;
let resa;
let minibar;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const jour = async (decalage = 0) => (await db.query('select (date_locale($1) + $2::int)::text d', [etab, decalage])).rows[0].d;
const resaDe = async (id) => (await db.query('select * from hotel_reservations where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ho.test');
  gerant = await utilisateur('gerant@ho.test');
  reception = await utilisateur('reception@ho.test');
  menage = await utilisateur('menage@ho.test');
  lecteur = await utilisateur('lecteur@ho.test');
  autreGerant = await utilisateur('autre@ho.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Hôtel de la Plage')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Hôtel')");
  etab = await valeur(sa, "select creer_etablissement($1, 'hotel', 'Hôtel de la Plage')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'hotel', 'Autre Hôtel')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'receptionniste'), ($1, $4, 'agent_entretien'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, reception, menage, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Mabiala', telephone: '+242 06 111 22 33', type: 'client' })]);
  minibar = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Minibar soda', prix_vente: 1500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('solution Hôtel', () => {
  test('un établissement Hôtel démarre avec chambres, réservations, facturation et une licence d’essai', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [etab])).rows.map((r) => r.module_id);
    expect(actifs).toEqual(expect.arrayContaining(['hotel_chambres', 'hotel_reservations', 'facturation', 'contacts', 'caisse', 'tableau_de_bord']));
    expect((await db.query("select statut from solutions where id = 'hotel'")).rows[0].statut).toBe('active');
    expect((await db.query('select formule, offre_id from licences where etablissement_id = $1', [etab])).rows[0]).toEqual({ formule: 'essai', offre_id: 'hotel-complet' });
  });
});

describe('chambres et entretien', () => {
  test('seul le gérant crée types et chambres ; doublons refusés', async () => {
    await expect(comme(reception, 'select enregistrer_type_chambre($1, $2::jsonb)', [etab, json({ nom: 'Standard', tarif_nuit: 25000 })])).rejects.toThrow(/Permission refusée/);
    standard = await valeur(gerant, 'select enregistrer_type_chambre($1, $2::jsonb)', [etab, json({ nom: 'Standard', tarif_nuit: 25000, capacite: 2 })]);
    suite = await valeur(gerant, 'select enregistrer_type_chambre($1, $2::jsonb)', [etab, json({ nom: 'Suite', tarif_nuit: 60000, capacite: 4 })]);
    await expect(comme(gerant, 'select enregistrer_type_chambre($1, $2::jsonb)', [etab, json({ nom: 'standard', tarif_nuit: 1 })])).rejects.toThrow(/existe déjà/);
    ch101 = await valeur(gerant, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: standard, numero: '101', etage: '1' })]);
    ch102 = await valeur(gerant, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: standard, numero: '102', etage: '1' })]);
    ch201 = await valeur(gerant, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: suite, numero: '201', etage: '2' })]);
    await expect(comme(gerant, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: standard, numero: '101' })])).rejects.toThrow(/existe déjà/);
    const typeAutre = await valeur(autreGerant, 'select enregistrer_type_chambre($1, $2::jsonb)', [autreEtab, json({ nom: 'X', tarif_nuit: 1 })]);
    await expect(comme(gerant, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: typeAutre, numero: '999' })])).rejects.toThrow(/type de la chambre/);
  });

  test('entretien : l’agent change l’état ; hors service exige un motif ; il ne crée rien', async () => {
    await comme(menage, "select changer_menage_chambre($1, 'en_nettoyage')", [ch102]);
    await expect(comme(menage, "select changer_menage_chambre($1, 'hors_service')", [ch102])).rejects.toThrow(/pourquoi/);
    await comme(menage, "select changer_menage_chambre($1, 'propre')", [ch102]);
    await expect(comme(menage, 'select enregistrer_chambre($1, $2::jsonb)', [etab, json({ type_id: standard, numero: '103' })])).rejects.toThrow(/Permission refusée/);
    expect(await comme(menage, 'select id from hotel_reservations')).toEqual([]);
  });
});

describe('réservations', () => {
  test('capacité, dates et passé contrôlés', async () => {
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'A', type_id: standard, arrivee: await jour(2), depart: await jour(2) })])).rejects.toThrow(/après l'arrivée/);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'A', type_id: standard, arrivee: await jour(-1), depart: await jour(1) })])).rejects.toThrow(/passé/);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'A', type_id: standard, adultes: 3, arrivee: await jour(1), depart: await jour(2) })])).rejects.toThrow(/Capacité/);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ type_id: standard, arrivee: await jour(1), depart: await jour(2) })])).rejects.toThrow(/nom du client/);
  });

  test('jamais de surréservation : 2 chambres Standard = 2 réservations par nuit', async () => {
    resa = await valeur(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ contact_id: client, type_id: standard, arrivee: await jour(0), depart: await jour(3), adultes: 2, source: 'whatsapp' })]);
    const r = await resaDe(resa);
    expect(r.numero).toMatch(/^RS-/);
    expect(Number(r.tarif_nuit)).toBe(25000);
    expect(r.nom_client).toBe('M. Mabiala');
    const r2 = await valeur(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'Mme Nkounkou', type_id: standard, chambre_id: ch102, arrivee: await jour(1), depart: await jour(4) })]);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'Trop', type_id: standard, arrivee: await jour(2), depart: await jour(3) })])).rejects.toThrow(/Complet/);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'X', type_id: standard, chambre_id: ch102, arrivee: await jour(3), depart: await jour(5) })])).rejects.toThrow(/déjà réservée|Complet/);
    const libre = await valeur(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'Après', type_id: standard, arrivee: await jour(4), depart: await jour(5) })]);
    expect(libre).toBeTruthy();
    const dispo = await valeur(reception, 'select disponibilites_hotel($1, $2::date, $3::date)', [etab, await jour(0), await jour(4)]);
    const std = dispo.find((t) => t.nom === 'Standard');
    expect(std.nuits.map((n) => n.reservees)).toEqual([1, 2, 2, 1, 1]);
    await expect(comme(reception, "select annuler_reservation_hotel($1, ' ')", [r2])).rejects.toThrow(/motif/);
    await expect(comme(reception, "select annuler_reservation_hotel($1, 'Pas venue', true)", [r2])).rejects.toThrow(/jour d'arrivée/);
    await comme(reception, "select annuler_reservation_hotel($1, 'Changement de programme')", [r2]);
    expect((await resaDe(r2)).statut).toBe('annulee');
  });

  test('le lecteur voit sans agir ; un autre hôtel ne voit rien', async () => {
    expect((await comme(lecteur, 'select id from hotel_reservations where etablissement_id = $1', [etab])).length).toBeGreaterThan(0);
    await expect(comme(lecteur, "select annuler_reservation_hotel($1, 'x')", [resa])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from hotel_reservations where etablissement_id = $1', [etab])).toEqual([]);
    await expect(comme(autreGerant, 'select check_in_hotel($1, $2)', [resa, ch101])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select tableau_de_bord_hotel($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });
});

describe('séjour', () => {
  test('arrivée : chambre du bon type et propre ; occupée ensuite', async () => {
    await expect(comme(reception, 'select check_in_hotel($1, $2)', [resa, ch201])).rejects.toThrow(/pas du type/);
    await comme(menage, "select changer_menage_chambre($1, 'sale')", [ch101]);
    await expect(comme(reception, 'select check_in_hotel($1, $2)', [resa, ch101])).rejects.toThrow(/pas prête/);
    await comme(menage, "select changer_menage_chambre($1, 'propre')", [ch101]);
    await expect(comme(menage, 'select check_in_hotel($1, $2)', [resa, ch101])).rejects.toThrow(/Permission refusée/);
    await comme(reception, 'select check_in_hotel($1, $2)', [resa, ch101]);
    const r = await resaDe(resa);
    expect(r.statut).toBe('en_cours');
    expect(r.chambre_id).toBe(ch101);
    await expect(comme(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ id: resa, nom_client: 'X', type_id: standard, arrivee: await jour(0), depart: await jour(5) })])).rejects.toThrow(/pas encore arrivée/);
    const tdb = await valeur(gerant, 'select tableau_de_bord_hotel($1)', [etab]);
    expect(tdb).toMatchObject({ chambres: 3, occupees: 1 });
  });

  test('prestations : article ou libre ; annulation avec motif ; jamais modifiées', async () => {
    const p1 = await valeur(reception, 'select ajouter_prestation_hotel($1, $2::jsonb)', [resa, json({ article_id: minibar, quantite: 2 })]);
    await valeur(reception, 'select ajouter_prestation_hotel($1, $2::jsonb)', [resa, json({ libelle: 'Blanchisserie', quantite: 1, prix_unitaire: 3000 })]);
    const p3 = await valeur(reception, 'select ajouter_prestation_hotel($1, $2::jsonb)', [resa, json({ libelle: 'Erreur', quantite: 1, prix_unitaire: 9999 })]);
    await expect(comme(reception, 'select ajouter_prestation_hotel($1, $2::jsonb)', [resa, json({ libelle: 'X', quantite: 0, prix_unitaire: 1 })])).rejects.toThrow(/Quantité/);
    await comme(reception, "select annuler_prestation_hotel($1, 'Saisie en double')", [p3]);
    await expect(comme(reception, 'update hotel_prestations set prix_unitaire = 0 where id = $1 returning id', [p1])).resolves.toEqual([]);
    await expect(db.query('update hotel_prestations set prix_unitaire = 0 where id = $1', [p1])).rejects.toThrow(/ne se modifie pas/);
  });

  test('séjour en cours : prolongation contrôlée et changement de chambre tracé', async () => {
    await expect(comme(reception, 'select prolonger_sejour_hotel($1,$2::date)', [resa, await jour(2)])).rejects.toThrow(/prolonger/);
    await comme(reception, 'select prolonger_sejour_hotel($1,$2::date)', [resa, await jour(4)]);
    expect((await db.query('select depart::text d from hotel_reservations where id=$1', [resa])).rows[0].d).toBe(await jour(4));
    await expect(comme(reception, "select changer_chambre_sejour_hotel($1,$2,' ')", [resa, ch102])).rejects.toThrow(/motif/);
    await comme(reception, "select changer_chambre_sejour_hotel($1,$2,'Climatisation bruyante')", [resa, ch102]);
    expect((await resaDe(resa)).chambre_id).toBe(ch102);
    expect((await db.query('select menage from hotel_chambres where id=$1', [ch101])).rows[0].menage).toBe('sale');
    await expect(comme(autreGerant, 'select prolonger_sejour_hotel($1,$2::date)', [resa, await jour(5)])).rejects.toThrow(/Permission refusée/);
  });

  test('départ : facture émise (1 nuit + prestations), chambre à nettoyer, agent prévenu', async () => {
    const r = await valeur(reception, 'select check_out_hotel($1)', [resa]);
    expect(r.nuits).toBe(1);
    expect(r.numero).toMatch(/^FA-/);
    const doc = (await db.query('select * from documents_vente where id = $1', [r.document_id])).rows[0];
    expect(doc.statut).toBe('emise');
    expect(Number(doc.total_ttc)).toBe(25000 + 3000 + 3000);
    expect(doc.contact_id).toBe(client);
    expect((await resaDe(resa)).statut).toBe('terminee');
    expect((await db.query('select menage from hotel_chambres where id = $1', [ch102])).rows[0].menage).toBe('sale');
    expect((await db.query("select count(*)::int n from notifications where user_id = $1 and type = 'hotel.menage'", [menage])).rows[0].n).toBe(1);
    await valeur(reception, "select encaisser_facture($1, 31000, 'mobile_money', 'MM-1')", [r.document_id]);
    expect((await db.query('select statut_paiement from ventes where id = $1', [doc.vente_id])).rows[0].statut_paiement).toBe('payee');
    await expect(comme(reception, 'select check_out_hotel($1)', [resa])).rejects.toThrow(/Seul un séjour en cours/);
  });

  test('client de passage sans fiche : devient un contact à la facture', async () => {
    const id = await valeur(reception, 'select enregistrer_reservation_hotel($1, $2::jsonb)', [etab, json({ nom_client: 'Voyageur de passage', telephone: '+242 05 000', type_id: suite, arrivee: await jour(0), depart: await jour(1) })]);
    await comme(reception, 'select check_in_hotel($1, $2)', [id, ch201]);
    const r = await valeur(reception, 'select check_out_hotel($1)', [id]);
    const doc = (await db.query('select c.nom from documents_vente d join contacts c on c.id = d.contact_id where d.id = $1', [r.document_id])).rows[0];
    expect(doc.nom).toBe('Voyageur de passage');
  });

  test('anonyme : aucune fonction hôtel ; vérification interne non exposée', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select tableau_de_bord_hotel($1)', [etab]))).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select verifier_disponibilite_hotel($1, $2, null, current_date, current_date + 1, null)', [etab, standard])).rejects.toThrow(/permission denied/);
  });
});
