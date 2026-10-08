import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Gestion immobilière : biens, propriétaires, baux, échéancier, encaissements (partiels, avances, concurrence),
// cautions, résiliation, maintenance, reversements, tableau de bord ; droits et isolation entre agences et clients.
let db;
let sa;
let directeur;
let gestionnaire;
let agent;
let lecteur;
let autreDirecteur;
let agence;
let agence2;
let autreClientAgence;
let proprio;
let immeuble;
let appart;
let studio;
let locataire;
let bail;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const un = async (sql, params = []) => (await db.query(sql, params)).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@immo.test');
  directeur = await utilisateur('directeur@immo.test');
  gestionnaire = await utilisateur('gestion@immo.test');
  agent = await utilisateur('agent@immo.test');
  lecteur = await utilisateur('lecteur@immo.test');
  autreDirecteur = await utilisateur('autre@immo.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const reseau = await valeur(sa, "select creer_client('Réseau Immo Fictif')");
  const autre = await valeur(sa, "select creer_client('Autre Réseau')");
  agence = await valeur(sa, "select creer_etablissement($1, 'immobilier', 'Agence Centre')", [reseau]);
  agence2 = await valeur(sa, "select creer_etablissement($1, 'immobilier', 'Agence Plateau')", [reseau]);
  autreClientAgence = await valeur(sa, "select creer_etablissement($1, 'immobilier', 'Agence Concurrente')", [autre]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'gestionnaire_immobilier'), ($1, $4, 'agent_immobilier'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [agence, directeur, gestionnaire, agent, lecteur, autreClientAgence, autreDirecteur]
  );
});

afterAll(async () => db.close());

describe('solution Immobilier', () => {
  test('les modules immobiliers sont actifs à la création de l’agence', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif', [agence])).rows.map((r) => r.module_id);
    expect(actifs).toEqual(expect.arrayContaining(['immo_biens', 'immo_locations', 'immo_maintenance']));
  });

  test('propriétaire, immeuble et lots ; droits et isolation', async () => {
    proprio = await valeur(agent, 'select enregistrer_proprietaire_immo($1, $2::jsonb)', [agence, json({ nom: 'Propriétaire fictif', telephone: '06 000 00 01', commission_taux: 8 })]);
    immeuble = await valeur(agent, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'immeuble', nom: 'Résidence Fictive', ville: 'Pointe-Noire', proprietaire_id: proprio })]);
    appart = await valeur(agent, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'appartement', nom: 'Résidence Fictive A1', parent_id: immeuble, proprietaire_id: proprio, pieces: 3, loyer_indicatif: 150000 })]);
    studio = await valeur(agent, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'Studio Fictif S1', proprietaire_id: proprio })]);
    await expect(comme(agent, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'studio fictif s1' })])).rejects.toThrow(/existe déjà/);
    await expect(comme(agent, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'Loué à la main', statut: 'loue' })])).rejects.toThrow(/créant un bail/);
    await expect(comme(lecteur, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'Pirate' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreDirecteur, 'select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'Intrus' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreDirecteur, 'select enregistrer_bien_immo($1, $2::jsonb)', [autreClientAgence, json({ type: 'studio', nom: 'Chez moi', proprietaire_id: proprio })]))
      .rejects.toThrow(/Propriétaire introuvable/);
    expect(await comme(autreDirecteur, 'select id from immo_biens where etablissement_id = $1', [agence])).toEqual([]);
    expect((await comme(lecteur, 'select id from immo_biens where etablissement_id = $1', [agence])).length).toBe(3);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select enregistrer_bien_immo($1, $2::jsonb)', [agence, json({ type: 'studio', nom: 'Anonyme' })])))
      .rejects.toThrow(/permission denied/);
  });

  test('bail : échéancier généré, bien loué, caution reçue ; un bien loué ne se reloue pas', async () => {
    locataire = await valeur(gestionnaire, 'select enregistrer_locataire_immo($1, $2::jsonb)', [agence, json({ nom: 'Locataire fictif', telephone: '06 000 00 02' })]);
    await expect(comme(agent, 'select creer_bail_immo($1, $2::jsonb)', [agence, json({ bien_id: appart, locataire_id: locataire, date_debut: '2026-01-01', loyer: 150000 })]))
      .rejects.toThrow(/Permission refusée/);
    await expect(comme(gestionnaire, 'select creer_bail_immo($1, $2::jsonb)', [agence, json({ bien_id: immeuble, locataire_id: locataire, date_debut: '2026-01-01', loyer: 1 })]))
      .rejects.toThrow(/pas l'immeuble/);
    bail = await valeur(gestionnaire, 'select creer_bail_immo($1, $2::jsonb)', [agence, json({
      bien_id: appart, locataire_id: locataire, date_debut: '2026-01-01', duree_mois: 12, loyer: 150000, charges: 10000, caution: 300000,
      caution_encaissee: true, jour_echeance: 5,
    })]);
    const b = await un('select numero, commission_taux, date_fin from immo_baux where id = $1', [bail]);
    expect(b.numero).toMatch(/^BAIL-\d{4}-0001$/);
    expect(Number(b.commission_taux)).toBe(8);
    const ech = (await db.query('select montant, date_echeance from immo_echeances where bail_id = $1 order by periode', [bail])).rows;
    expect(ech).toHaveLength(12);
    expect(Number(ech[0].montant)).toBe(160000);
    expect((await un('select statut from immo_biens where id = $1', [appart])).statut).toBe('loue');
    expect(Number((await un('select caution_detenue from immo_situation_baux where bail_id = $1', [bail])).caution_detenue)).toBe(300000);
    await expect(comme(gestionnaire, 'select creer_bail_immo($1, $2::jsonb)', [agence, json({ bien_id: appart, locataire_id: locataire, date_debut: '2026-02-01', loyer: 1 })]))
      .rejects.toThrow(/pas disponible/);
  });

  test('encaissements : partiel, solde, avance, plafond, numéro de quittance ; annulation motivée', async () => {
    const r1 = await valeur(gestionnaire, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: 100000, mode: 'mobile_money', date: '2026-01-06' })]);
    expect(r1.numero).toMatch(/^Q-\d{4}-0001$/);
    let e = (await db.query('select paye, statut from immo_echeances where bail_id = $1 order by periode limit 2', [bail])).rows;
    expect(e[0]).toMatchObject({ statut: 'partielle' });
    const r2 = await valeur(gestionnaire, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: 220000, mode: 'especes', date: '2026-02-03' })]);
    e = (await db.query('select paye, statut from immo_echeances where bail_id = $1 order by periode limit 3', [bail])).rows;
    expect(e.map((x) => x.statut)).toEqual(['payee', 'payee', 'a_payer']);
    await expect(comme(gestionnaire, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: 99999999 })])).rejects.toThrow(/dépasse/);
    await expect(comme(lecteur, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: 1000 })])).rejects.toThrow(/Permission refusée/);
    const q = await valeur(lecteur, 'select quittance_immo($1)', [r2.encaissement_id]);
    expect(q.locataire.nom).toBe('Locataire fictif');
    expect(q.periodes.length).toBe(2);
    await expect(comme(gestionnaire, "select annuler_encaissement_immo($1, '  ')", [r2.encaissement_id])).rejects.toThrow(/motif/);
    await comme(gestionnaire, "select annuler_encaissement_immo($1, 'Chèque rejeté')", [r2.encaissement_id]);
    e = (await db.query('select statut from immo_echeances where bail_id = $1 order by periode limit 2', [bail])).rows;
    expect(e.map((x) => x.statut)).toEqual(['partielle', 'a_payer']);
    await comme(gestionnaire, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: 220000, mode: 'especes', date: '2026-02-04' })]);
  });

  test('concurrence : deux encaissements simultanés du dernier reste dû, un seul passe', async () => {
    const reste = Number((await un("select sum(montant - paye) r from immo_echeances where bail_id = $1 and statut in ('a_payer','partielle')", [bail])).r);
    const appel = () => comme(gestionnaire, 'select encaisser_loyer_immo($1, $2::jsonb)', [bail, json({ montant: reste, mode: 'virement' })]);
    const resultats = await Promise.allSettled([appel(), appel()]);
    expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(Number((await un("select coalesce(sum(montant - paye), 0) r from immo_echeances where bail_id = $1 and statut <> 'annulee'", [bail])).r)).toBe(0);
  });

  test('caution : retenue motivée, jamais plus que détenu', async () => {
    await expect(comme(gestionnaire, 'select mouvement_caution_immo($1, $2::jsonb)', [bail, json({ type: 'retenue', montant: 50000 })])).rejects.toThrow(/motivée/);
    await comme(gestionnaire, 'select mouvement_caution_immo($1, $2::jsonb)', [bail, json({ type: 'retenue', montant: 50000, motif: 'Peinture du salon' })]);
    await expect(comme(gestionnaire, 'select mouvement_caution_immo($1, $2::jsonb)', [bail, json({ type: 'restituee', montant: 300000 })])).rejects.toThrow(/supérieur/);
    await comme(gestionnaire, 'select mouvement_caution_immo($1, $2::jsonb)', [bail, json({ type: 'restituee', montant: 250000, mode: 'especes' })]);
    expect(Number((await un('select caution_detenue from immo_situation_baux where bail_id = $1', [bail])).caution_detenue)).toBe(0);
  });

  test('maintenance et reversement au propriétaire (commission et travaux déduits, jamais deux fois)', async () => {
    const inc = await valeur(gestionnaire, 'select enregistrer_incident_immo($1, $2::jsonb)', [agence, json({ bien_id: appart, bail_id: bail, titre: 'Fuite salle de bain', priorite: 'haute', a_charge_de: 'proprietaire' })]);
    await comme(gestionnaire, "select changer_statut_incident_immo($1, 'resolu', $2::jsonb)", [inc, json({ cout: 25000, date: '2026-02-10', prestataire: 'Plombier fictif' })]);
    await expect(comme(gestionnaire, "select changer_statut_incident_immo($1, 'en_cours')", [inc])).rejects.toThrow(/clos/);
    await expect(comme(gestionnaire, 'select preparer_reversement_immo($1, $2, $3, $4)', [agence, proprio, '2026-01-01', '2026-12-31'])).rejects.toThrow(/Permission refusée/);
    const rev = await valeur(directeur, 'select preparer_reversement_immo($1, $2, $3, $4)', [agence, proprio, '2026-01-01', '2026-12-31']);
    const r = await un('select loyers_encaisses, commission, frais, net from immo_reversements where id = $1', [rev]);
    const encaisse = Number((await un("select sum(montant) s from immo_encaissements where bail_id = $1 and statut = 'valide'", [bail])).s);
    expect(Number(r.loyers_encaisses)).toBe(encaisse);
    expect(Number(r.commission)).toBe(Math.round(encaisse * 8) / 100);
    expect(Number(r.frais)).toBe(25000);
    expect(Number(r.net)).toBe(encaisse - Number(r.commission) - 25000);
    await expect(comme(directeur, 'select preparer_reversement_immo($1, $2, $3, $4)', [agence, proprio, '2026-01-01', '2026-12-31'])).rejects.toThrow(/Rien à reverser/);
    const enc = (await un("select id from immo_encaissements where bail_id = $1 and statut = 'valide' limit 1", [bail])).id;
    await expect(comme(gestionnaire, "select annuler_encaissement_immo($1, 'Erreur')", [enc])).rejects.toThrow(/reversement/);
    await comme(directeur, "select regler_reversement_immo($1, $2::jsonb)", [rev, json({ reference: 'VIR-FICTIF-1' })]);
    expect((await un('select statut from immo_reversements where id = $1', [rev])).statut).toBe('paye');
  });

  test('résiliation : échéances futures non payées annulées, bien libéré, motif obligatoire', async () => {
    await expect(comme(gestionnaire, "select resilier_bail_immo($1, '2026-12-31', ' ')", [bail])).rejects.toThrow(/motif/);
    await comme(gestionnaire, "select resilier_bail_immo($1, '2026-12-31', 'Départ du locataire')", [bail]);
    expect((await un('select statut from immo_baux where id = $1', [bail])).statut).toBe('resilie');
    expect((await un('select statut from immo_biens where id = $1', [appart])).statut).toBe('libre');
  });

  test('tableau de bord calculé par la base ; isolé entre agences du même réseau', async () => {
    const tb = await valeur(directeur, "select tableau_de_bord_immobilier($1, '2026-03-15')", [agence]);
    expect(tb.lots).toBe(2);
    expect(tb.cautions_detenues).toBeDefined();
    await expect(comme(directeur, 'select tableau_de_bord_immobilier($1)', [agence2])).rejects.toThrow(/Permission refusée/);
    expect(await comme(directeur, 'select id from immo_baux where etablissement_id = $1', [agence2])).toEqual([]);
  });

  test('aucune écriture directe ni suppression', async () => {
    await expect(comme(directeur, "update immo_biens set nom = 'X' where id = $1", [appart])).rejects.toThrow(/permission denied/);
    await expect(comme(directeur, 'delete from immo_encaissements')).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from immo_biens where id = $1', [studio])).rejects.toThrow();
  });
});
