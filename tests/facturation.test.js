import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Facturation : devis, factures, émission (vente + stock), paiements, avoirs, numérotation, droits, isolation.
let db;
let sa;
let gerant;
let comptable;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let hub;
let client;
let fournisseur;
let autreClient;
let riz;
let service;
let devis;
let facture;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).rows[0].q);
const doc = async (id) => (await db.query('select * from documents_vente where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@fa.test');
  gerant = await utilisateur('gerant@fa.test');
  comptable = await utilisateur('compta@fa.test');
  caissier = await utilisateur('caissier@fa.test');
  lecteur = await utilisateur('lecteur@fa.test');
  autreGerant = await utilisateur('autre@fa.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe Facture')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Facture')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin Facture')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Facture')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'facturation', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'facturation', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'comptable'), ($1, $4, 'employe'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, comptable, caissier, lecteur, autreEtab, autreGerant]
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Hôtel Client', societe: 'Hôtel Client SARL', identifiant_fiscal: 'm123', type: 'client' })]);
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Grossiste', type: 'fournisseur' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent' })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 25 kg', prix_vente: 18000, cout_achat: 15000, suivi_stock: true, unite: 'sac' })]);
  service = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Livraison', prix_vente: 2000, suivi_stock: false })]);
  await comme(gerant, "select ajuster_stock_hub($1, $2, 'entree', 10, 'Réception', null)", [hub, riz]);
});

afterAll(async () => db.close());

describe('devis', () => {
  test('le contact enregistre raison sociale et identifiant fiscal', async () => {
    const c = (await db.query('select societe, identifiant_fiscal from contacts where id = $1', [client])).rows[0];
    expect(c).toEqual({ societe: 'Hôtel Client SARL', identifiant_fiscal: 'M123' });
  });

  test('un devis numéroté calcule HT, TVA et TTC ; validité par défaut ; un fournisseur ou un client étranger est refusé', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'facturation', $2::jsonb)", [etab, json({ tva_par_defaut: 18, validite_devis_jours: 15 })]);
    devis = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      type: 'devis', contact_id: client, objet: 'Approvisionnement',
      lignes: [
        { article_id: riz, quantite: 2 },
        { libelle: 'Conseil sur place', quantite: 1, prix_unitaire: 10000, remise: 1000, taux_tva: 0 },
      ],
    })]);
    const d = await doc(devis);
    expect(d.numero).toBe('DE-00001');
    expect(Number(d.total_ht)).toBe(36000 + 9000);
    expect(Number(d.total_tva)).toBe(6480);
    expect(Number(d.total_ttc)).toBe(51480);
    expect(Math.round((new Date(d.echeance) - new Date(d.date_document)) / 86400000)).toBe(15);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: fournisseur, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/client/);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: autreClient, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/client/);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 10, remise: 20 }] })])).rejects.toThrow(/Remise invalide/);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: client, lignes: [] })])).rejects.toThrow(/au moins une ligne/);
  });

  test('le devis envoyé reste modifiable ; accepté puis converti en facture brouillon sans numéro ; le stock ne bouge pas', async () => {
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [devis]);
    await comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      id: devis, contact_id: client, objet: 'Approvisionnement révisé', lignes: [{ article_id: riz, quantite: 3, taux_tva: 0 }, { article_id: service, quantite: 1, taux_tva: 0 }],
    })]);
    expect(Number((await doc(devis)).total_ttc)).toBe(56000);
    await expect(comme(gerant, "select changer_statut_devis($1, 'converti')", [devis])).rejects.toThrow(/impossible/);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [devis]);
    facture = await valeur(gerant, 'select convertir_devis($1)', [devis]);
    expect((await doc(devis)).statut).toBe('converti');
    const f = await doc(facture);
    expect(f).toMatchObject({ type: 'facture', statut: 'brouillon', numero: null, origine_id: devis });
    expect(Number(f.total_ttc)).toBe(56000);
    expect(await stock(riz)).toBe(10);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ id: devis, contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/plus modifiable/);
    await expect(comme(gerant, 'select convertir_devis($1)', [devis])).rejects.toThrow(/ne peut plus/);
  });
});

describe('factures', () => {
  test("l'émission numérote, crée la vente (origine facture) et sort le stock du Hub", async () => {
    await expect(comme(caissier, 'select emettre_facture($1)', [facture])).rejects.toThrow(/Permission refusée/);
    const r = await valeur(gerant, 'select emettre_facture($1)', [facture]);
    expect(r.numero).toBe('FA-00001');
    const f = await doc(facture);
    expect(f.statut).toBe('emise');
    const v = (await db.query('select * from ventes where id = $1', [r.vente_id])).rows[0];
    expect(v).toMatchObject({ numero: 'FA-00001', origine: 'facture', statut_paiement: 'impayee', contact_id: client, hub_id: hub });
    expect(Number(v.total)).toBe(56000);
    expect(await stock(riz)).toBe(7);
    expect((await db.query('select count(*)::int n from lignes_vente where vente_id = $1', [r.vente_id])).rows[0].n).toBe(2);
    await expect(comme(gerant, 'select emettre_facture($1)', [facture])).rejects.toThrow(/déjà émise/);
  });

  test('une facture émise est figée, même en écriture directe ; la vente ne s’annule pas depuis la caisse', async () => {
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ id: facture, contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/plus modifiable/);
    await expect(db.query('update documents_vente set total_ht = 1, total_ttc = 1 + total_tva where id = $1', [facture])).rejects.toThrow(/émise/);
    await expect(db.query('delete from lignes_document_vente where document_id = $1', [facture])).rejects.toThrow(/figé/);
    await expect(db.query('delete from documents_vente where id = $1', [facture])).rejects.toThrow();
    const venteId = (await doc(facture)).vente_id;
    await expect(comme(gerant, "select annuler_vente($1, 'test')", [venteId])).rejects.toThrow(/avoir/);
  });

  test('stock insuffisant refusé à l’émission ; la numérotation ne saute pas', async () => {
    const trop = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'facture', contact_id: client, lignes: [{ article_id: riz, quantite: 50 }] })]);
    await expect(comme(gerant, 'select emettre_facture($1)', [trop])).rejects.toThrow(/Stock insuffisant/);
    expect((await doc(trop)).numero).toBeNull();
    await comme(gerant, "select annuler_document_vente($1, 'Erreur de quantité')", [trop]);
    expect((await doc(trop)).statut).toBe('annule');
    const libre = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'facture', contact_id: client, lignes: [{ libelle: 'Formation caisse', quantite: 2, prix_unitaire: 15000, taux_tva: 0 }] })]);
    expect((await valeur(gerant, 'select emettre_facture($1)', [libre])).numero).toBe('FA-00002');
    const ligne = (await db.query('select l.article_id, l.libelle from lignes_vente l join documents_vente d on d.vente_id = l.vente_id where d.id = $1', [libre])).rows[0];
    expect(ligne).toEqual({ article_id: null, libelle: 'Formation caisse' });
  });

  test('paiements partiels : virement sans caisse, espèces exigent une caisse ouverte, jamais plus que le reste', async () => {
    await expect(comme(gerant, "select encaisser_facture($1, 10000, 'especes')", [facture])).rejects.toThrow(/caisse ouverte/);
    await expect(comme(gerant, "select encaisser_facture($1, 99999, 'virement')", [facture])).rejects.toThrow(/reste dû/);
    await expect(comme(lecteur, "select encaisser_facture($1, 1000, 'virement')", [facture])).rejects.toThrow(/Permission refusée/);
    await comme(comptable, "select encaisser_facture($1, 20000, 'virement', 'VIR-001')", [facture]);
    let v = (await db.query('select v.* from ventes v join documents_vente d on d.vente_id = v.id where d.id = $1', [facture])).rows[0];
    expect(v.statut_paiement).toBe('partielle');
    await comme(comptable, "select encaisser_facture($1, 36000, 'mobile_money', 'MM-9')", [facture]);
    v = (await db.query('select v.* from ventes v join documents_vente d on d.vente_id = v.id where d.id = $1', [facture])).rows[0];
    expect(v.statut_paiement).toBe('payee');
    const complet = await valeur(lecteur, 'select document_vente_complet($1)', [facture]);
    expect(complet.paiements).toHaveLength(2);
    expect(complet.contact.identifiant_fiscal).toBe('M123');
    expect(complet.origine.numero).toBe('DE-00001');
  });

  test("l'avoir exige l'annulation des paiements, remet le stock et annule la vente", async () => {
    await expect(comme(comptable, "select annuler_document_vente($1, 'Client a renvoyé la marchandise')", [facture])).rejects.toThrow(/paiements/);
    for (const p of await comme(gerant, 'select p.id from paiements p join documents_vente d on d.vente_id = p.vente_id where d.id = $1', [facture])) {
      await comme(gerant, "select annuler_paiement($1, 'Remboursement')", [p.id]);
    }
    await expect(comme(comptable, "select annuler_document_vente($1, '')", [facture])).rejects.toThrow(/motif/);
    const avoir = await valeur(comptable, "select annuler_document_vente($1, 'Marchandise retournée')", [facture]);
    expect(await doc(avoir)).toMatchObject({ type: 'avoir', numero: 'AV-00001', statut: 'emise', origine_id: facture });
    expect((await doc(facture)).statut).toBe('annule');
    expect(await stock(riz)).toBe(10);
    const v = (await db.query('select v.statut from ventes v join documents_vente d on d.vente_id = v.id where d.id = $1', [facture])).rows[0];
    expect(v.statut).toBe('annulee');
    await expect(comme(gerant, "select annuler_document_vente($1, 'encore')", [facture])).rejects.toThrow(/ne peut plus/);
    await expect(db.query("update documents_vente set objet = 'x' where id = $1", [avoir])).rejects.toThrow(/définitif/);
  });

  test('dupliquer une facture crée un nouveau brouillon ; tableau de bord des encaissements', async () => {
    const copie = await valeur(gerant, 'select dupliquer_document_vente($1)', [facture]);
    expect(await doc(copie)).toMatchObject({ type: 'facture', statut: 'brouillon', numero: null });
    await comme(gerant, 'select emettre_facture($1)', [copie]);
    const tdb = await valeur(comptable, 'select tableau_de_bord_facturation($1)', [etab]);
    expect(Number(tdb.a_encaisser)).toBe(56000 + 30000);
    expect(tdb.factures_ouvertes).toBe(2);
    expect(tdb.taux_conversion).toBe(100);
    await expect(comme(caissier, 'select tableau_de_bord_facturation($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });
});

describe('sécurité', () => {
  test('isolation : un autre établissement ne voit ni ne touche les documents', async () => {
    expect(await comme(autreGerant, 'select id from documents_vente')).toHaveLength(0);
    expect(await comme(autreGerant, 'select id from lignes_document_vente')).toHaveLength(0);
    await expect(comme(autreGerant, 'select document_vente_complet($1)', [facture])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select emettre_facture($1)', [facture])).rejects.toThrow();
    await expect(comme(autreGerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'facture', contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/Permission refusée/);
  });

  test('le caissier ne lit pas la facturation ; le lecteur lit sans écrire', async () => {
    expect(await comme(caissier, 'select id from documents_vente')).toHaveLength(0);
    expect((await comme(lecteur, 'select id from documents_vente')).length).toBeGreaterThan(0);
    await expect(comme(lecteur, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 1 }] })])).rejects.toThrow(/Permission refusée/);
  });

  test('aucune écriture directe ; module retiré = plus rien ; anon refusé', async () => {
    await expect(comme(gerant, "insert into documents_vente(etablissement_id, hub_id, type, contact_id, cree_par) values ($1, $2, 'devis', $3, $4)", [etab, hub, client, gerant])).rejects.toThrow();
    expect(await comme(gerant, "update documents_vente set objet = 'pirate' returning id")).toHaveLength(0);
    await comme(sa, "select definir_module_etablissement($1, 'facturation', false)", [etab]);
    expect(await comme(gerant, 'select id from documents_vente')).toHaveLength(0);
    await expect(comme(gerant, 'select dupliquer_document_vente($1)', [facture])).rejects.toThrow(/Permission refusée/);
    await comme(sa, "select definir_module_etablissement($1, 'facturation', true)", [etab]);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select tableau_de_bord_facturation($1)', [etab]))).rejects.toThrow(/permission denied/);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from documents_vente'))).rows).toHaveLength(0);
  });
});
