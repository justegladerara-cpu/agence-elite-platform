import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Achats : demande → commande → envoi → réceptions (stock du Hub) → paiements fournisseur, droits, Hubs, isolation.
let db;
let sa;
let gerant;
let depotier;
let respB;
let comptable;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let depot;
let hubB;
let fournisseur;
let client;
let riz;
let huile;
let service;
let demande;
let commande;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const stockHub = async (hub, article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where hub_id = $1 and article_id = $2', [hub, article])).rows[0].q);
const cmd = async (id) => (await db.query('select * from commandes_achat where id = $1', [id])).rows[0];
const lignes = async (id) => (await db.query('select * from lignes_commande_achat where commande_id = $1 order by ordre', [id])).rows;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ac.test');
  gerant = await utilisateur('gerant@ac.test');
  depotier = await utilisateur('depot@ac.test');
  respB = await utilisateur('respb@ac.test');
  comptable = await utilisateur('compta@ac.test');
  caissier = await utilisateur('caisse@ac.test');
  lecteur = await utilisateur('lecteur@ac.test');
  autreGerant = await utilisateur('autre@ac.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe Achat')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Achat')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin Achat')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Achat')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'achats', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'achats', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'gestionnaire_depot'), ($1, $4, 'responsable_hub'), ($1, $5, 'comptable'), ($1, $6, 'employe'),
     ($1, $7, 'lecteur'), ($8, $9, 'gerant')`,
    [etab, gerant, depotier, respB, comptable, caissier, lecteur, autreEtab, autreGerant]
  );
  depot = await valeur(gerant, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Dépôt', type: 'depot' })]);
  hubB = await valeur(gerant, 'select enregistrer_hub($1, $2::jsonb)', [etab, json({ nom: 'Magasin B' })]);
  await comme(gerant, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, depotier, [depot]]);
  await comme(gerant, 'select definir_hubs_membre($1, $2, $3::uuid[])', [etab, respB, [hubB]]);
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Grossiste du Port', type: 'fournisseur' })]);
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Client', type: 'client' })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 25 kg', prix_vente: 18000, cout_achat: 15000, suivi_stock: true, stock_minimum: 5 })]);
  huile = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Huile 5 L', prix_vente: 6000, cout_achat: 4500, suivi_stock: true })]);
  service = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Livraison', prix_vente: 2000, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('demandes d’achat', () => {
  test('le caissier ne peut pas demander ; le gestionnaire de dépôt ne peut pas commander directement', async () => {
    await expect(comme(caissier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow(/Permission refusée/);
    await expect(comme(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ fournisseur_id: fournisseur, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow(/Permission refusée/);
  });

  test('une demande sans fournisseur prend le dépôt accessible, numéro DA- ; service et client refusés', async () => {
    await expect(comme(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, lignes: [{ article_id: service, quantite: 1 }] })]))
      .rejects.toThrow(/pas suivi en stock/);
    await expect(comme(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, fournisseur_id: client, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow(/fournisseur actif/);
    await expect(comme(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, hub_id: hubB, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow();
    demande = await valeur(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, notes: 'Rupture proche', lignes: [{ article_id: riz, quantite: 10 }] })]);
    const d = await cmd(demande);
    expect(d).toMatchObject({ numero: 'DA-00001', statut: 'demande', hub_id: depot, demande_par: depotier, fournisseur_id: null });
    expect(Number(d.total)).toBe(150000);
  });

  test('le demandeur voit sa demande ; l’employé de l’autre Hub non', async () => {
    expect((await comme(depotier, 'select id from commandes_achat')).map((r) => r.id)).toEqual([demande]);
    expect(await comme(respB, 'select id from commandes_achat')).toEqual([]);
    expect(await comme(caissier, 'select id from commandes_achat')).toEqual([]);
  });

  test('approuver exige un fournisseur, renumérote en BC- et notifie le demandeur', async () => {
    await expect(comme(depotier, "select changer_statut_commande_achat($1, 'brouillon', $2)", [demande, fournisseur])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select changer_statut_commande_achat($1, 'brouillon')", [demande])).rejects.toThrow(/fournisseur/);
    await comme(gerant, "select changer_statut_commande_achat($1, 'brouillon', $2)", [demande, fournisseur]);
    const d = await cmd(demande);
    expect(d).toMatchObject({ numero: 'BC-00001', statut: 'brouillon', fournisseur_id: fournisseur });
    expect(d.notes).toMatch(/DA-00001 approuvée/);
    const notes = await valeur(depotier, 'select mes_notifications()');
    expect(notes.liste[0]).toMatchObject({ titre: "Demande d'achat approuvée", lien: `achats/${demande}` });
  });

  test('une demande refusée (annulée) notifie le demandeur avec le motif', async () => {
    const d2 = await valeur(depotier, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ demande: true, lignes: [{ article_id: huile, quantite: 3 }] })]);
    await expect(comme(gerant, 'select annuler_commande_achat($1, $2)', [d2, ' '])).rejects.toThrow(/motif/);
    await comme(gerant, 'select annuler_commande_achat($1, $2)', [d2, 'Stock suffisant']);
    expect((await cmd(d2)).statut).toBe('annulee');
    expect((await valeur(depotier, 'select mes_notifications()')).liste[0].texte).toMatch(/Stock suffisant/);
  });
});

describe('commandes et réceptions', () => {
  test('commande directe, envoi : échéance par défaut, lignes figées', async () => {
    commande = await valeur(gerant, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({
      fournisseur_id: fournisseur, hub_id: depot, date_commande: '2026-10-01',
      lignes: [{ article_id: riz, quantite: 20, cout_unitaire: 14500 }, { article_id: huile, quantite: 12 }],
    })]);
    let c = await cmd(commande);
    expect(c).toMatchObject({ numero: 'BC-00002', statut: 'brouillon' });
    expect(Number(c.total)).toBe(20 * 14500 + 12 * 4500);
    await comme(gerant, "select changer_statut_commande_achat($1, 'envoyee')", [commande]);
    c = await cmd(commande);
    expect(c.statut).toBe('envoyee');
    expect(c.echeance).toEqual(new Date('2026-10-31'));
    await expect(comme(gerant, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({ id: commande, fournisseur_id: fournisseur, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow(/plus modifiable/);
    await expect(db.query('update lignes_commande_achat set quantite = 1 where commande_id = $1', [commande])).rejects.toThrow(/ne se modifient plus/);
    await expect(db.query('delete from commandes_achat where id = $1', [commande])).rejects.toThrow(/Suppression interdite/);
  });

  test('réception partielle par le dépôt : stock, coût d’achat, numéro RE-, montant, notification', async () => {
    const [lRiz, lHuile] = await lignes(commande);
    const re = await valeur(depotier, 'select receptionner_commande_achat($1, $2::jsonb, $3)', [commande, json([
      { ligne_id: lRiz.id, quantite: 8 }, { ligne_id: lHuile.id, quantite: 0 },
    ]), 'BL-778']);
    const r = (await db.query('select * from receptions_achat where id = $1', [re])).rows[0];
    expect(r).toMatchObject({ numero: 'RE-00001', bon_livraison: 'BL-778', hub_id: depot, recue_par: depotier });
    expect(Number(r.montant)).toBe(8 * 14500);
    expect(await stockHub(depot, riz)).toBe(8);
    expect(Number((await db.query('select cout_achat from articles where id = $1', [riz])).rows[0].cout_achat)).toBe(14500);
    const c = await cmd(commande);
    expect(c.statut).toBe('partielle');
    expect(Number(c.montant_recu)).toBe(8 * 14500);
    expect((await valeur(gerant, 'select mes_notifications()')).liste[0].lien).toBe(`achats/${commande}`);
    const m = (await db.query('select type, reception_id, cout_unitaire from mouvements_stock where reception_id = $1', [re])).rows;
    expect(m).toEqual([{ type: 'entree', reception_id: re, cout_unitaire: '14500.00' }]);
  });

  test('offensif : trop reçu, ligne en double, négative, d’une autre commande, rien reçu ; réception immuable', async () => {
    const [lRiz] = await lignes(commande);
    const [lAutre] = await lignes(demande);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 13 }])])).rejects.toThrow(/Trop reçu/);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 6 }, { ligne_id: lRiz.id, quantite: 6 }])])).rejects.toThrow(/deux fois/);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: -2 }])])).rejects.toThrow(/invalide/);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lAutre.id, quantite: 1 }])])).rejects.toThrow(/inconnue/);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 0 }])])).rejects.toThrow(/Aucune quantité/);
    await expect(comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [demande, json([{ ligne_id: lAutre.id, quantite: 1 }])])).rejects.toThrow(/envoyée/);
    await expect(comme(respB, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 1 }])])).rejects.toThrow();
    await expect(comme(comptable, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 1 }])])).rejects.toThrow(/Permission refusée/);
    await expect(db.query('update receptions_achat set montant = 0')).rejects.toThrow();
    await expect(db.query('delete from receptions_achat')).rejects.toThrow(/Suppression interdite/);
    expect(await stockHub(depot, riz)).toBe(8);
  });

  test('le reste reçu passe la commande en « reçue » ; envoyée → brouillon refusé après réception', async () => {
    const [lRiz, lHuile] = await lignes(commande);
    await comme(depotier, 'select receptionner_commande_achat($1, $2::jsonb)', [commande, json([{ ligne_id: lRiz.id, quantite: 12 }, { ligne_id: lHuile.id, quantite: 12, cout_unitaire: 4600 }])]);
    const c = await cmd(commande);
    expect(c.statut).toBe('recue');
    expect(Number(c.montant_recu)).toBe(20 * 14500 + 12 * 4600);
    expect([await stockHub(depot, riz), await stockHub(depot, huile)]).toEqual([20, 12]);
    await expect(comme(gerant, "select changer_statut_commande_achat($1, 'brouillon')", [commande])).rejects.toThrow(/impossible/);
    await expect(comme(gerant, 'select annuler_commande_achat($1, $2)', [commande, 'Erreur'])).rejects.toThrow(/ne s'annule plus/);
  });
});

describe('paiements fournisseur', () => {
  test('le comptable paie en deux fois ; trop payé et dépôt refusés ; aucune dépense créée', async () => {
    const total = Math.max(Number((await cmd(commande)).total), Number((await cmd(commande)).montant_recu));
    await expect(comme(depotier, "select payer_fournisseur($1, 1000, 'especes')", [commande])).rejects.toThrow(/Permission refusée/);
    await expect(comme(comptable, "select payer_fournisseur($1, $2, 'especes')", [commande, total + 1])).rejects.toThrow(/reste à payer/);
    await expect(comme(comptable, "select payer_fournisseur($1, 1000, 'troc')", [commande])).rejects.toThrow(/Mode/);
    const p1 = await valeur(comptable, "select payer_fournisseur($1, 100000, 'virement', 'VIR-1')", [commande]);
    await valeur(comptable, "select payer_fournisseur($1, 50000, 'especes')", [commande]);
    expect(Number((await cmd(commande)).montant_paye)).toBe(150000);
    await expect(comme(comptable, 'select annuler_paiement_fournisseur($1, $2)', [p1, ''])).rejects.toThrow(/motif/);
    await comme(comptable, 'select annuler_paiement_fournisseur($1, $2)', [p1, 'Virement rejeté']);
    await expect(comme(comptable, 'select annuler_paiement_fournisseur($1, $2)', [p1, 'Encore'])).rejects.toThrow(/déjà annulé/);
    expect(Number((await cmd(commande)).montant_paye)).toBe(50000);
    await expect(db.query('delete from paiements_fournisseur')).rejects.toThrow(/Suppression interdite/);
    expect((await db.query('select count(*)::int n from depenses where etablissement_id = $1', [etab])).rows[0].n).toBe(0);
  });

  test('tableau de bord et suggestions (sous le minimum, en commande)', async () => {
    await comme(gerant, "select ajuster_stock_hub($1, $2, 'ajustement', -18, 'Casse')", [depot, riz]);
    const sug = await valeur(gerant, 'select suggestions_achat($1)', [etab]);
    expect(sug.find((s) => s.article_id === riz && s.hub_id === depot)).toMatchObject({ stock: 2, minimum: 5, en_commande: 10 });
    const tdb = await valeur(comptable, 'select tableau_de_bord_achats($1)', [etab]);
    expect(Number(tdb.du_fournisseurs)).toBe(20 * 14500 + 12 * 4600 - 50000);
    expect(tdb.demandes).toBe(0);
    expect(await valeur(respB, 'select suggestions_achat($1)', [etab])).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ hub_id: depot })])
    );
  });
});

describe('isolation et lecture', () => {
  test('le lecteur lit sans écrire ; un autre établissement ne voit ni n’agit', async () => {
    expect((await comme(lecteur, 'select id from commandes_achat')).length).toBeGreaterThan(0);
    await expect(comme(lecteur, "select payer_fournisseur($1, 1000, 'especes')", [commande])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from commandes_achat where etablissement_id = $1', [etab])).toEqual([]);
    expect(await comme(autreGerant, 'select id from receptions_achat')).toEqual([]);
    await expect(comme(autreGerant, "select payer_fournisseur($1, 1000, 'especes')", [commande])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select enregistrer_commande_achat($1, $2::jsonb)', [autreEtab, json({ fournisseur_id: fournisseur, lignes: [{ article_id: riz, quantite: 1 }] })]))
      .rejects.toThrow(/fournisseur actif/);
    await expect(comme(autreGerant, 'select tableau_de_bord_achats($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('les fonctions internes et les écritures directes sont fermées', async () => {
    await expect(comme(gerant, 'select recalculer_commande_achat($1)', [commande])).rejects.toThrow();
    await expect(comme(gerant, "insert into commandes_achat(etablissement_id, numero, hub_id, cree_par) values ($1, 'X', $2, $3)", [etab, depot, gerant])).rejects.toThrow();
    await comme(gerant, 'update commandes_achat set montant_paye = 0 where id = $1', [commande]).catch(() => null);
    expect(Number((await cmd(commande)).montant_paye)).toBe(50000);
  });
});
