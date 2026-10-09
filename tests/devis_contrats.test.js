import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot B : options de devis, versions, validité, validation des remises, échéancier, contrats et avenants.
let db;
let sa;
let gerant;
let commercial;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let fournisseur;
let autreClient;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const doc = async (id) => (await db.query('select * from documents_vente where id = $1', [id])).rows[0];
const devis = (user, lignes, extra = {}) => valeur(user, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: client, lignes, ...extra })]);
const parametres = (data) => comme(gerant, "select enregistrer_parametres_module($1, 'facturation', $2::jsonb)", [etab, json(data)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@dc.test');
  gerant = await utilisateur('gerant@dc.test');
  commercial = await utilisateur('commercial@dc.test');
  lecteur = await utilisateur('lecteur@dc.test');
  autreGerant = await utilisateur('autre@dc.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Bureau Devis')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Devis')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Bureau Devis')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Devis')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['facturation', 'contrats']) {
      await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
      await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, commercial, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Clinique Exemple', type: 'client' })]);
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Maintenance Exemple', type: 'fournisseur' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent' })]);
});

afterAll(async () => db.close());

describe('devis : options, versions, validité', () => {
  test('une option ne compte que si elle est retenue ; seule une ligne de devis peut être en option', async () => {
    const id = await devis(commercial, [
      { libelle: 'Installation', quantite: 1, prix_unitaire: 100000 },
      { libelle: 'Formation', quantite: 1, prix_unitaire: 30000, optionnelle: true },
    ]);
    expect(Number((await doc(id)).total_ttc)).toBe(100000);
    const option = (await db.query('select id from lignes_document_vente where document_id = $1 and optionnelle', [id])).rows[0].id;
    await comme(commercial, 'select retenir_option_devis($1, true)', [option]);
    expect(Number((await doc(id)).total_ttc)).toBe(130000);
    await comme(commercial, 'select retenir_option_devis($1, false)', [option]);
    expect(Number((await doc(id)).total_ttc)).toBe(100000);
    await expect(comme(lecteur, 'select retenir_option_devis($1, true)', [option])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select retenir_option_devis($1, true)', [option])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      type: 'facture', contact_id: client, lignes: [{ libelle: 'X', quantite: 1, prix_unitaire: 1, optionnelle: true }],
    })])).rejects.toThrow(/option n'existe que sur un devis/);
  });

  test('la facture ne reprend que les lignes comptées ; une option non retenue n’y figure pas', async () => {
    const id = await devis(gerant, [
      { libelle: 'Audit', quantite: 1, prix_unitaire: 50000 },
      { libelle: 'Rapport imprimé', quantite: 1, prix_unitaire: 5000, optionnelle: true },
      { libelle: 'Suivi trimestriel', quantite: 1, prix_unitaire: 20000, optionnelle: true, retenue: true },
    ]);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [id]);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [id]);
    const f = await valeur(gerant, 'select convertir_devis($1)', [id]);
    const lignes = (await db.query('select libelle, optionnelle, ordre from lignes_document_vente where document_id = $1 order by ordre', [f])).rows;
    expect(lignes.map((l) => [l.libelle, l.optionnelle, l.ordre])).toEqual([['Audit', false, 1], ['Suivi trimestriel', false, 2]]);
    expect(Number((await doc(f)).total_ttc)).toBe(70000);
  });

  test('nouvelle version : numéro -V2, ancienne annulée, une seule version à jour', async () => {
    const v1 = await devis(commercial, [{ libelle: 'Site vitrine', quantite: 1, prix_unitaire: 400000 }]);
    await comme(commercial, "select changer_statut_devis($1, 'envoye')", [v1]);
    const numero = (await doc(v1)).numero;
    const v2 = await valeur(commercial, 'select nouvelle_version_devis($1)', [v1]);
    expect(await doc(v2)).toMatchObject({ numero: `${numero}-V2`, version: 2, version_de: v1, statut: 'brouillon' });
    expect(await doc(v1)).toMatchObject({ statut: 'annule', motif_annulation: 'Remplacé par la version 2' });
    await expect(comme(commercial, 'select nouvelle_version_devis($1)', [v1])).rejects.toThrow(/clos/);
    const v3 = await valeur(commercial, 'select nouvelle_version_devis($1)', [v2]);
    expect(await doc(v3)).toMatchObject({ numero: `${numero}-V3`, version: 3, version_de: v1 });
    await expect(comme(lecteur, 'select nouvelle_version_devis($1)', [v3])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select nouvelle_version_devis($1)', [v3])).rejects.toThrow(/Permission refusée/);
  });

  test('validité : l’accord d’un devis expiré n’est refusé que si l’établissement le règle', async () => {
    const hier = (await db.query("select (current_date - 1)::text d")).rows[0].d;
    const avant = (await db.query("select (current_date - 10)::text d")).rows[0].d;
    const vieux = await devis(gerant, [{ libelle: 'Étude', quantite: 1, prix_unitaire: 1000 }], { date_document: avant, echeance: hier });
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [vieux]);
    await parametres({ bloquer_devis_expires: true });
    await expect(comme(gerant, "select changer_statut_devis($1, 'accepte')", [vieux])).rejects.toThrow(/Devis expiré/);
    await expect(comme(gerant, 'select convertir_devis($1)', [vieux])).rejects.toThrow(/Devis expiré/);
    await parametres({ bloquer_devis_expires: false });
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [vieux]);
    expect((await doc(vieux)).statut).toBe('accepte');
  });
});

describe('remises au-delà du seuil', () => {
  test('sans réglage rien ne change ; avec seuil, validation par un responsable avant envoi et émission', async () => {
    const libre = await devis(commercial, [{ libelle: 'Matériel', quantite: 1, prix_unitaire: 10000, remise: 5000 }]);
    await comme(commercial, "select changer_statut_devis($1, 'envoye')", [libre]);
    await parametres({ remise_max_sans_validation: 10 });
    const id = await devis(commercial, [{ libelle: 'Matériel', quantite: 2, prix_unitaire: 10000, remise: 3000 }]);
    await expect(comme(commercial, "select changer_statut_devis($1, 'envoye')", [id])).rejects.toThrow(/Remise de 15\.00 % au-delà du seuil de 10 %/);
    await expect(comme(commercial, 'select valider_remise_document($1)', [id])).rejects.toThrow(/Permission refusée/);
    expect(Number(await valeur(gerant, 'select valider_remise_document($1)', [id]))).toBe(15);
    await comme(commercial, "select changer_statut_devis($1, 'envoye')", [id]);
    // Une remise plus forte redemande une validation.
    await comme(commercial, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      id, type: 'devis', contact_id: client, lignes: [{ libelle: 'Matériel', quantite: 2, prix_unitaire: 10000, remise: 5000 }],
    })]);
    await expect(comme(commercial, "select changer_statut_devis($1, 'accepte')", [id])).rejects.toThrow(/25\.00 %/);
    await comme(gerant, 'select valider_remise_document($1)', [id]);
    await comme(commercial, "select changer_statut_devis($1, 'accepte')", [id]);
    // La facture issue du devis garde la validation et s'émet.
    const f = await valeur(commercial, 'select convertir_devis($1)', [id]);
    expect(Number((await doc(f)).remise_validee_pct)).toBe(25);
    await comme(gerant, 'select emettre_facture($1)', [f]);
    // Une facture saisie directement avec une forte remise ne s'émet pas sans validation.
    const directe = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      type: 'facture', contact_id: client, lignes: [{ libelle: 'Remise exceptionnelle', quantite: 1, prix_unitaire: 1000, remise: 500 }],
    })]);
    await expect(comme(gerant, 'select emettre_facture($1)', [directe])).rejects.toThrow(/au-delà du seuil/);
    await parametres({ remise_max_sans_validation: 0 });
    await comme(gerant, 'select emettre_facture($1)', [directe]);
  });
});

describe('échéancier', () => {
  test('somme égale au total, dates dans l’ordre ; copié sur la facture', async () => {
    const auj = (await db.query('select current_date::text d')).rows[0].d;
    const jour = (n) => new Date(Date.parse(`${auj}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const id = await devis(gerant, [{ libelle: 'Chantier', quantite: 1, prix_unitaire: 90000 }], { date_document: auj });
    await expect(comme(gerant, 'select definir_echeancier($1, $2::jsonb)', [id, json([{ date_echeance: jour(0), montant: 30000 }])])).rejects.toThrow(/doit égaler/);
    await expect(comme(gerant, 'select definir_echeancier($1, $2::jsonb)', [id, json([
      { date_echeance: jour(30), montant: 45000 }, { date_echeance: jour(0), montant: 45000 }])])).rejects.toThrow(/ordre des dates/);
    await comme(gerant, 'select definir_echeancier($1, $2::jsonb)', [id, json([
      { date_echeance: jour(0), montant: 30000, libelle: 'Acompte à la commande' },
      { date_echeance: jour(30), montant: 60000, libelle: 'Solde à la livraison' }])]);
    expect((await comme(lecteur, 'select libelle from echeances_document where document_id = $1 order by ordre', [id])).map((e) => e.libelle))
      .toEqual(['Acompte à la commande', 'Solde à la livraison']);
    await expect(comme(lecteur, 'select definir_echeancier($1, $2::jsonb)', [id, '[]'])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from echeances_document')).toEqual([]);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [id]);
    const f = await valeur(gerant, 'select convertir_devis($1)', [id]);
    expect((await db.query('select count(*)::int n from echeances_document where document_id = $1', [f])).rows[0].n).toBe(2);
    await comme(gerant, 'select definir_echeancier($1, $2::jsonb)', [f, '[]']);
    expect((await db.query('select count(*)::int n from echeances_document where document_id = $1', [f])).rows[0].n).toBe(0);
  });
});

describe('contrats', () => {
  let contrat;
  test('depuis un devis accepté : brouillon repris, un seul contrat par devis', async () => {
    const id = await devis(commercial, [{ libelle: 'Maintenance annuelle', quantite: 1, prix_unitaire: 240000 }], { objet: 'Maintenance du parc' });
    await expect(comme(commercial, 'select contrat_depuis_devis($1)', [id])).rejects.toThrow(/accepté ou facturé/);
    await comme(commercial, "select changer_statut_devis($1, 'envoye')", [id]);
    await comme(commercial, "select changer_statut_devis($1, 'accepte')", [id]);
    contrat = await valeur(commercial, 'select contrat_depuis_devis($1)', [id]);
    const k = (await db.query('select * from contrats where id = $1', [contrat])).rows[0];
    expect(k).toMatchObject({ statut: 'brouillon', objet: 'Maintenance du parc', contact_id: client, document_vente_id: id, sens: 'client' });
    expect(k.numero).toMatch(/^CT-/);
    expect(Number(k.montant)).toBe(240000);
    await expect(comme(commercial, 'select contrat_depuis_devis($1)', [id])).rejects.toThrow(/existe déjà/);
    await expect(comme(lecteur, 'select contrat_depuis_devis($1)', [id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select contrat_depuis_devis($1)', [id])).rejects.toThrow(/introuvable/);
  });

  test('cycle de vie, avenants définitifs, modification seulement en brouillon', async () => {
    await comme(commercial, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({
      id: contrat, contact_id: client, objet: 'Maintenance du parc', montant: 20000, periodicite: 'mensuelle',
      debut: '2026-01-01', fin: '2026-12-31', reconduction_tacite: true, preavis_jours: 60,
    })]);
    await expect(comme(commercial, "select changer_statut_contrat($1, 'termine')", [contrat])).rejects.toThrow(/Passage impossible/);
    await comme(commercial, "select changer_statut_contrat($1, 'actif', null, '2025-12-20')", [contrat]);
    await expect(comme(commercial, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ id: contrat, contact_id: client, objet: 'X' })])).rejects.toThrow(/avenant/);
    await expect(comme(commercial, "select ajouter_avenant($1, $2::jsonb)", [contrat, json({ objet: ' ', date_effet: '2026-06-01' })])).rejects.toThrow(/objet/);
    const av = await valeur(commercial, 'select ajouter_avenant($1, $2::jsonb)', [contrat, json({ objet: 'Ajout de deux postes', date_effet: '2026-06-01', montant: 25000, fin: '2027-06-30' })]);
    const k = (await db.query('select * from contrats where id = $1', [contrat])).rows[0];
    expect(Number(k.montant)).toBe(25000);
    expect(k.version).toBe(2);
    const a = (await db.query('select * from contrat_avenants where id = $1', [av])).rows[0];
    expect([a.numero, Number(a.montant_avant), Number(a.montant_apres)]).toEqual([1, 20000, 25000]);
    await expect(db.query("update contrat_avenants set objet = 'x' where id = $1", [av])).rejects.toThrow();
    await expect(db.query('delete from contrats where id = $1', [contrat])).rejects.toThrow();
    await expect(comme(commercial, "select changer_statut_contrat($1, 'suspendu')", [contrat])).rejects.toThrow(/motif/);
    await comme(commercial, "select changer_statut_contrat($1, 'suspendu', 'Impayé en cours')", [contrat]);
    await comme(commercial, "select changer_statut_contrat($1, 'actif')", [contrat]);
    expect(Number(await valeur(lecteur, 'select montant_annuel_contrat(25000, $1)', ['mensuelle']))).toBe(300000);
  });

  test('contrat fournisseur : contact fournisseur exigé ; isolation et lecture', async () => {
    await expect(comme(gerant, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ sens: 'fournisseur', contact_id: client, objet: 'X' })])).rejects.toThrow(/fournisseur/);
    await expect(comme(gerant, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ contact_id: autreClient, objet: 'X' })])).rejects.toThrow(/client de cet établissement/);
    const f = await valeur(gerant, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ sens: 'fournisseur', contact_id: fournisseur, objet: 'Entretien climatisation', montant: 50000, periodicite: 'trimestrielle', debut: '2026-01-01' })]);
    await expect(comme(gerant, "select changer_statut_contrat($1, 'annule')", [f])).rejects.toThrow(/motif/);
    await comme(gerant, "select changer_statut_contrat($1, 'actif')", [f]);
    expect((await comme(lecteur, 'select numero from contrats')).length).toBe(2);
    expect(await comme(autreGerant, 'select id from contrats')).toEqual([]);
    expect(await comme(autreGerant, 'select id from contrat_avenants')).toEqual([]);
    await expect(comme(lecteur, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ contact_id: client, objet: 'X' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, "select changer_statut_contrat($1, 'termine')", [f])).rejects.toThrow(/Permission refusée/);
    await expect(comme(lecteur, "insert into contrats(etablissement_id, numero, contact_id, objet, debut, cree_par) values ($1, 'X', $2, 'X', current_date, $3)", [etab, client, lecteur])).rejects.toThrow();
  });

  test('tableau de bord : engagements annualisés et préavis à surveiller', async () => {
    const auj = (await db.query('select current_date::text d')).rows[0].d;
    const dans = (n) => new Date(Date.parse(`${auj}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const proche = await valeur(gerant, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ contact_id: client, objet: 'Hébergement', montant: 10000, periodicite: 'annuelle', debut: dans(-300), fin: dans(70), reconduction_tacite: true, preavis_jours: 30 })]);
    await comme(gerant, "select changer_statut_contrat($1, 'actif')", [proche]);
    const t = await valeur(lecteur, 'select cockpit_contrats($1, $2::date, $3::date)', [etab, dans(-30), auj]);
    const kpi = Object.fromEntries(t.kpis.map((k) => [k.cle, Number(k.valeur)]));
    expect(kpi.actifs).toBe(3);
    expect(kpi.engagement_clients).toBe(300000 + 10000);
    expect(kpi.engagement_fournisseurs).toBe(200000);
    const alertes = Object.fromEntries(t.attention.map((a) => [a.cle, Number(a.nombre)]));
    expect(alertes.preavis).toBe(1);
    await expect(comme(autreGerant, 'select cockpit_contrats($1, current_date, current_date)', [etab])).rejects.toThrow(/Permission refusée/);
    expect((await valeur(lecteur, 'select cockpit_domaines($1)', [etab])).map((d) => d.id)).toContain('contrats');
  });
});
