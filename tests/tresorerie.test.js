import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot E : facture contestée, trop-perçus et crédits client, relevé de compte client, validation des dépenses.
let db;
let sa;
let gerant;
let responsable;
let comptable;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let autreContact;
let autreClient;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const ligne = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];
const vente = async (docId) => (await db.query('select v.* from ventes v join documents_vente d on d.vente_id = v.id where d.id = $1', [docId])).rows[0];
const facture = async (contact, montant, e = etab, user = gerant) => {
  const id = await valeur(user, 'select enregistrer_document_vente($1, $2::jsonb)', [e, json({
    type: 'facture', contact_id: contact, lignes: [{ libelle: 'Prestation', quantite: 1, prix_unitaire: montant, taux_tva: 0 }],
  })]);
  await comme(user, 'select emettre_facture($1)', [id]);
  return id;
};

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@tr.test');
  gerant = await utilisateur('gerant@tr.test');
  responsable = await utilisateur('resp@tr.test');
  comptable = await utilisateur('compta@tr.test');
  lecteur = await utilisateur('lecteur@tr.test');
  autreGerant = await utilisateur('autre@tr.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe Trésorerie')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Trésorerie')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin Trésorerie')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Trésorerie')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['facturation', 'depenses']) {
      await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
      await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'responsable'), ($1, $4, 'comptable'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, responsable, comptable, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Client Exemple', type: 'client' })]);
  autreContact = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Autre client', type: 'client' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent', type: 'client' })]);
});

afterAll(async () => db.close());

describe('facture contestée', () => {
  test('une contestation est tracée puis close ; une seule ouverte à la fois ; droits et isolation', async () => {
    const f = await facture(client, 30000);
    await expect(comme(lecteur, "select contester_facture($1, 'Quantité')", [f])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, "select contester_facture($1, 'Quantité')", [f])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select contester_facture($1, '  ')", [f])).rejects.toThrow(/conteste/);
    const c = await valeur(gerant, "select contester_facture($1, 'Le client dit avoir reçu 2 cartons, pas 3')", [f]);
    await expect(comme(gerant, "select contester_facture($1, 'Encore')", [f])).rejects.toThrow(/déjà ouverte/);
    expect(await comme(lecteur, 'select motif from contestations_facture where id = $1', [c])).toHaveLength(1);
    expect(await comme(autreGerant, 'select * from contestations_facture')).toHaveLength(0);
    // La facture n'est pas modifiée : elle reste due.
    expect((await ligne('documents_vente', f)).statut).toBe('emise');
    await expect(comme(gerant, "select clore_contestation_facture($1, '')", [c])).rejects.toThrow(/terminée/);
    await comme(gerant, "select clore_contestation_facture($1, 'Bon de livraison signé montré au client')", [c]);
    expect((await ligne('contestations_facture', c)).close_par).toBe(gerant);
    await expect(comme(gerant, "select clore_contestation_facture($1, 'x')", [c])).rejects.toThrow(/déjà close/);
    expect(await valeur(gerant, "select contester_facture($1, 'Nouveau désaccord')", [f])).toBeTruthy();
    await expect(db.query('delete from contestations_facture where id = $1', [c])).rejects.toThrow();
  });

  test('un brouillon ne se conteste pas', async () => {
    const b = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'facture', contact_id: client, lignes: [{ libelle: 'x', quantite: 1, prix_unitaire: 10 }] })]);
    await expect(comme(gerant, "select contester_facture($1, 'x')", [b])).rejects.toThrow(/émise/);
  });
});

describe('trop-perçus et crédits client', () => {
  let credit;
  let f1;
  test("l'excédent d'un virement devient un crédit ; la facture est soldée", async () => {
    f1 = await facture(client, 50000);
    await expect(comme(gerant, "select encaisser_avec_trop_percu($1, 60000, 'especes')", [f1])).rejects.toThrow(/espèces se rendent/);
    await expect(comme(gerant, "select encaisser_avec_trop_percu($1, 50000, 'virement')", [f1])).rejects.toThrow(/dépasser le reste dû/);
    await expect(comme(lecteur, "select encaisser_avec_trop_percu($1, 60000, 'virement')", [f1])).rejects.toThrow(/Permission refusée/);
    credit = await valeur(gerant, "select encaisser_avec_trop_percu($1, 62000, 'virement', 'VIR-123')", [f1]);
    const k = await ligne('credits_client', credit);
    expect(k).toMatchObject({ numero: 'CR-00001', contact_id: client, mode: 'virement', statut: 'disponible' });
    expect(Number(k.montant)).toBe(12000);
    const v = await vente(f1);
    expect(Number(v.montant_paye)).toBe(50000);
    expect(await comme(autreGerant, 'select * from credits_client')).toHaveLength(0);
  });

  test("le crédit règle une autre facture du même client, jamais celle d'un autre", async () => {
    const f2 = await facture(client, 8000);
    const etrangere = await facture(autreContact, 8000);
    await expect(comme(gerant, 'select utiliser_credit_client($1, $2, 5000)', [credit, etrangere])).rejects.toThrow(/même client/);
    await expect(comme(gerant, 'select utiliser_credit_client($1, $2, 13000)', [credit, f2])).rejects.toThrow(/crédit disponible/);
    await expect(comme(autreGerant, 'select utiliser_credit_client($1, $2, 1000)', [credit, f2])).rejects.toThrow(/Permission refusée/);
    const p = await valeur(gerant, 'select utiliser_credit_client($1, $2, 8000)', [credit, f2]);
    expect((await ligne('paiements', p))).toMatchObject({ mode: 'virement', reference: 'Crédit client CR-00001' });
    expect(Number((await vente(f2)).montant_paye)).toBe(8000);
    const k = await ligne('credits_client', credit);
    expect(Number(k.montant_utilise)).toBe(8000);
    expect(k.statut).toBe('disponible');
  });

  test('le reste du crédit est marqué remboursé (droit d’annulation requis)', async () => {
    await expect(comme(lecteur, "select rembourser_credit_client($1, 'virement')", [credit])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select rembourser_credit_client($1, 'mobile_money', 'Rendu au client')", [credit]);
    const k = await ligne('credits_client', credit);
    expect(k.statut).toBe('rembourse');
    expect(Number(k.montant_rembourse)).toBe(4000);
    await expect(comme(gerant, "select rembourser_credit_client($1, 'virement')", [credit])).rejects.toThrow(/déjà/);
    const usages = (await db.query('select nature, montant::int m from credits_client_usages where credit_id = $1 order by cree_le', [credit])).rows;
    expect(usages).toEqual([{ nature: 'facture', m: 8000 }, { nature: 'remboursement', m: 4000 }]);
    await expect(db.query('update credits_client_usages set montant = 1')).rejects.toThrow();
  });
});

describe('relevé de compte client', () => {
  test('solde d’ouverture, mouvements de la période et solde de clôture', async () => {
    const jour = (await db.query('select date_locale($1)::text j', [etab])).rows[0].j;
    const r = await valeur(lecteur, 'select releve_client($1, $2, $3::date, $3::date)', [etab, client, jour]);
    // Factures du jour : 30000 (contestée, due), 50000 (payée 50000), 8000 (payée par le crédit).
    expect(Number(r.solde_ouverture)).toBe(0);
    expect(Number(r.total_debit)).toBe(88000);
    expect(Number(r.total_credit)).toBe(58000);
    expect(Number(r.solde_cloture)).toBe(30000);
    expect(r.lignes.map((l) => l.libelle)).toEqual(expect.arrayContaining([expect.stringMatching(/^Facture FA-/), expect.stringMatching(/^Encaissement .* VIR-123$/)]));
    const lendemain = await valeur(lecteur, "select releve_client($1, $2, $3::date + 1, $3::date + 30)", [etab, client, jour]);
    expect(Number(lendemain.solde_ouverture)).toBe(30000);
    expect(lendemain.lignes).toEqual([]);
    await expect(comme(autreGerant, 'select releve_client($1, $2, $3::date, $3::date)', [etab, client, jour])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select releve_client($1, $2, $3::date, $3::date)', [autreEtab, client, jour])).rejects.toThrow(/introuvable/);
    await expect(comme(lecteur, "select releve_client($1, $2, '2026-02-01', '2026-01-01')", [etab, client])).rejects.toThrow(/Période/);
  });
});

describe('validation des dépenses', () => {
  const depense = (extra = {}) => json({ libelle: 'Réparation du groupe électrogène', montant: 250000, mode: 'virement', ...extra });
  test('sans seuil, rien ne change', async () => {
    expect(await valeur(comptable, 'select enregistrer_depense($1, $2::jsonb)', [etab, depense()])).toBeTruthy();
    expect(await valeur(comptable, 'select reglages_depenses($1)', [etab])).toEqual({ seuil_validation: 0, peut_valider: false });
  });

  test('au-dessus du seuil, la dépense passe par une demande validée par une autre personne', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'depenses', $2::jsonb)", [etab, json({ seuil_validation: 100000 })]);
    await expect(comme(comptable, 'select enregistrer_depense($1, $2::jsonb)', [etab, depense()])).rejects.toThrow(/seuil de validation/);
    expect(await valeur(comptable, 'select enregistrer_depense($1, $2::jsonb)', [etab, depense({ montant: 99999 })])).toBeTruthy();
    expect(await valeur(gerant, 'select enregistrer_depense($1, $2::jsonb)', [etab, depense()])).toBeTruthy();
    const avant = Number((await db.query('select count(*) n from depenses where etablissement_id = $1', [etab])).rows[0].n);
    const d = await valeur(comptable, 'select demander_depense($1, $2::jsonb)', [etab, depense()]);
    expect(Number((await db.query('select count(*) n from depenses where etablissement_id = $1', [etab])).rows[0].n)).toBe(avant);
    const notifs = (await db.query("select user_id from notifications where type = 'depenses.a_valider'")).rows.map((n) => n.user_id).sort();
    expect(notifs).toEqual([gerant, responsable].sort());
    await expect(comme(comptable, 'select decider_demande_depense($1, true)', [d])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select decider_demande_depense($1, true)', [d])).rejects.toThrow(/Permission refusée/);
    const dep = await valeur(responsable, 'select decider_demande_depense($1, true)', [d]);
    expect(await ligne('depenses', dep)).toMatchObject({ libelle: 'Réparation du groupe électrogène', mode: 'virement', statut: 'valide' });
    expect(await ligne('demandes_depense', d)).toMatchObject({ statut: 'validee', decide_par: responsable, depense_id: dep });
    await expect(comme(gerant, 'select decider_demande_depense($1, false, $2)', [d, 'Trop tard'])).rejects.toThrow(/déjà été traitée/);
    expect((await db.query("select count(*)::int n from notifications where type = 'depenses.decision' and user_id = $1", [comptable])).rows[0].n).toBe(1);
  });

  test('refus motivé ; on ne valide pas sa propre demande ; la caisse n’est pas concernée', async () => {
    const d = await valeur(gerant, 'select demander_depense($1, $2::jsonb)', [etab, depense({ libelle: 'Climatiseur' })]);
    await expect(comme(gerant, 'select decider_demande_depense($1, true)', [d])).rejects.toThrow(/autre personne/);
    await expect(comme(responsable, 'select decider_demande_depense($1, false)', [d])).rejects.toThrow(/pourquoi/);
    expect(await valeur(responsable, "select decider_demande_depense($1, false, 'Attendre le devis')", [d])).toBeNull();
    expect(await ligne('demandes_depense', d)).toMatchObject({ statut: 'refusee', motif_refus: 'Attendre le devis', depense_id: null });
    await expect(comme(comptable, 'select demander_depense($1, $2::jsonb)', [etab, depense({ montant: 0 })])).rejects.toThrow(/Montant/);
    await expect(comme(comptable, 'select demander_depense($1, $2::jsonb)', [etab, depense({ fournisseur_id: autreClient })])).rejects.toThrow(/Fournisseur inconnu/);
    await expect(comme(lecteur, 'select demander_depense($1, $2::jsonb)', [etab, depense()])).rejects.toThrow(/Permission refusée/);
    expect(await comme(lecteur, 'select statut from demandes_depense')).toHaveLength(2);
    expect(await comme(autreGerant, 'select * from demandes_depense')).toHaveLength(0);
    await expect(db.query('delete from demandes_depense where id = $1', [d])).rejects.toThrow();
  });

  test('les fonctions internes ne sont pas appelables', async () => {
    await expect(comme(gerant, 'select seuil_validation_depense($1)', [etab])).rejects.toThrow(/permission denied/);
  });
});
