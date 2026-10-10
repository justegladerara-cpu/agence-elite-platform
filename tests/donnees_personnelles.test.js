import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot F : export et anonymisation des données d'un contact, liens de partage à durée limitée.
let db;
let sa;
let gerant;
let employe;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let facture;
let piece;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const anonyme = (sql, params = []) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const ligne = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];
const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
const dans = (jours) => new Date(Date.now() + jours * 86400000).toISOString();

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@dp.test');
  gerant = await utilisateur('gerant@dp.test');
  employe = await utilisateur('employe@dp.test');
  lecteur = await utilisateur('lecteur@dp.test');
  autreGerant = await utilisateur('autre@dp.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe Données')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Données')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin Données')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Données')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['facturation', 'agenda']) {
      await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
      await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, employe, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({
    nom: 'Mme Exemple', societe: 'Exemple SARL', type: 'client', telephone: '+00 06 11 22 33 44', email: 'mme@exemple.test', adresse: '12 rue Fictive', notes: 'Préfère WhatsApp',
  })]);
  await valeur(gerant, 'select enregistrer_interlocuteur($1, $2::jsonb)', [etab, json({ contact_id: client, nom: 'M. Assistant', telephone: '+00 06 99 88 77 66' })]);
  await valeur(gerant, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ contact_id: client, debut: dans(3), titre: 'Visite' })]);
  facture = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
    type: 'facture', contact_id: client, lignes: [{ libelle: 'Prestation', quantite: 1, prix_unitaire: 10000, taux_tva: 0 }],
  })]);
  await comme(gerant, 'select emettre_facture($1)', [facture]);
  // Destinataire d'une campagne déjà préparée (ligne figée) : écrit directement, comme le ferait la préparation.
  const seg = (await db.query("insert into mkt_segments(etablissement_id, nom) values ($1, 'Tous') returning id", [etab])).rows[0].id;
  const camp = (await db.query("insert into mkt_campagnes(etablissement_id, numero, nom, canal, segment_id, message, statut, cree_par) values ($1, 'CA-1', 'Promo', 'sms', $2, 'Bonjour', 'envoyee', $3) returning id", [etab, seg, gerant])).rows[0].id;
  await db.query("insert into mkt_destinataires(etablissement_id, campagne_id, contact_id, nom, coordonnee) values ($1, $2, $3, 'Mme Exemple', '+00 06 11 22 33 44')", [etab, camp, client]);
  piece = await valeur(gerant, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'document_vente', objet_id: facture, nom: 'Bon.pdf', contenu: pdf })]);
});

afterAll(async () => db.close());

describe('export des données d’un contact', () => {
  test('rassemble le contact et tout ce qui le concerne ; réservé au gérant ; tracé', async () => {
    const r = await valeur(gerant, 'select exporter_donnees_contact($1)', [client]);
    expect(r.contact).toMatchObject({ nom: 'Mme Exemple', email: 'mme@exemple.test' });
    expect(Object.keys(r.donnees)).toEqual(expect.arrayContaining(['contact_interlocuteurs', 'agenda_rendez_vous', 'documents_vente', 'ventes']));
    expect(r.donnees.contact_interlocuteurs[0].nom).toBe('M. Assistant');
    await expect(comme(employe, 'select exporter_donnees_contact($1)', [client])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select exporter_donnees_contact($1)', [client])).rejects.toThrow(/Permission refusée/);
    expect((await db.query("select count(*)::int n from evenements where type = 'contact.export'")).rows[0].n).toBe(1);
  });
});

describe('anonymisation', () => {
  test('refusée tant qu’une facture reste à payer ; motif obligatoire ; droits', async () => {
    await expect(comme(gerant, "select anonymiser_contact($1, 'Demande par e-mail du 10/10')", [client])).rejects.toThrow(/facture reste à payer/);
    await comme(gerant, "select encaisser_facture($1, 10000, 'virement')", [facture]);
    await expect(comme(gerant, "select anonymiser_contact($1, ' ')", [client])).rejects.toThrow(/justifie/);
    await expect(comme(employe, "select anonymiser_contact($1, 'x')", [client])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, "select anonymiser_contact($1, 'x')", [client])).rejects.toThrow(/Permission refusée/);
  });

  test('efface les coordonnées partout, garde montants et historique, expurge le journal', async () => {
    const bilan = await valeur(gerant, "select anonymiser_contact($1, 'Demande par e-mail du 10/10')", [client]);
    expect(bilan).toMatchObject({ contact_interlocuteurs: 1, agenda_rendez_vous: 1, mkt_destinataires: 1 });
    expect((await db.query('select nom, coordonnee from mkt_destinataires where contact_id = $1', [client])).rows).toEqual([{ nom: 'Contact anonymisé', coordonnee: 'Contact anonymisé' }]);
    await expect(db.query("update mkt_destinataires set nom = 'x' where contact_id = $1", [client])).rejects.toThrow(/définitive/);
    const k = await ligne('contacts', client);
    expect(k).toMatchObject({ nom: 'Contact anonymisé', societe: null, telephone: null, email: null, adresse: null, notes: null, actif: false });
    expect(k.anonymise_le).not.toBeNull();
    const inter = (await db.query('select nom, telephone from contact_interlocuteurs where contact_id = $1', [client])).rows;
    expect(inter).toEqual([{ nom: 'Contact anonymisé', telephone: null }]);
    const rdv = (await db.query('select nom_client, telephone from agenda_rendez_vous where contact_id = $1', [client])).rows[0];
    expect(rdv.telephone ?? null).toBeNull();
    expect(Number((await ligne('documents_vente', facture)).total_ttc)).toBe(10000);
    const traces = (await db.query("select avant::text a, apres::text b from journal_audit where table_nom in ('contacts', 'contact_interlocuteurs', 'agenda_rendez_vous')")).rows;
    expect(traces.length).toBeGreaterThan(2);
    for (const t of traces) {
      expect(`${t.a} ${t.b}`).not.toMatch(/Exemple|mme@exemple|06 11 22|Assistant|WhatsApp|rue Fictive/);
    }
    expect(await comme(gerant, 'select motif from anonymisations')).toEqual([{ motif: 'Demande par e-mail du 10/10' }]);
    expect(await comme(lecteur, 'select * from anonymisations')).toHaveLength(0);
    await expect(comme(gerant, "select anonymiser_contact($1, 'encore')", [client])).rejects.toThrow(/déjà anonymisé/);
  });

  test('le journal reste en ajout seul pour tout le reste', async () => {
    await expect(db.query("update journal_audit set apres = '{}' where id = (select min(id) from journal_audit)")).rejects.toThrow(/ajout seul/);
    await expect(db.query('delete from journal_audit where id = (select min(id) from journal_audit)')).rejects.toThrow(/ajout seul/);
    await expect(comme(gerant, 'select champs_personnels($1)', ['contacts'])).rejects.toThrow(/permission denied/);
  });
});

describe('liens de partage à durée limitée', () => {
  let jeton;
  let lien;
  test('un lien ouvre le document sans compte, compte les ouvertures', async () => {
    await expect(comme(lecteur, 'select creer_lien_partage($1, 24)', [piece])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select creer_lien_partage($1, 24)', [piece])).rejects.toThrow(/introuvable/);
    await expect(comme(gerant, 'select creer_lien_partage($1, 0)', [piece])).rejects.toThrow(/Durée/);
    await expect(comme(gerant, 'select creer_lien_partage($1, 721)', [piece])).rejects.toThrow(/Durée/);
    const r = await valeur(gerant, 'select creer_lien_partage($1, 48)', [piece]);
    jeton = r.jeton;
    lien = r.id;
    expect(jeton).toMatch(/^[0-9a-f]{64}$/);
    const stocke = await ligne('liens_partage', lien);
    expect(stocke.jeton_empreinte).not.toBe(jeton);
    const ouvert = Object.values((await anonyme('select ouvrir_lien_partage($1)', [jeton]))[0])[0];
    expect(ouvert).toMatchObject({ nom: 'Bon.pdf', contenu: pdf, emetteur: 'Magasin Données' });
    expect((await ligne('liens_partage', lien)).ouvertures).toBe(1);
    await expect(anonyme('select ouvrir_lien_partage($1)', ['0'.repeat(64)])).rejects.toThrow(/n'existe pas ou a expiré/);
    await expect(anonyme('select ouvrir_lien_partage($1)', ["' or 1=1 --"])).rejects.toThrow(/n'existe pas ou a expiré/);
    expect(await anonyme('select * from liens_partage')).toEqual([]);
    expect(await comme(autreGerant, 'select * from liens_partage')).toHaveLength(0);
  });

  test('révoqué ou expiré : le lien ne marche plus', async () => {
    await expect(comme(lecteur, 'select revoquer_lien_partage($1)', [lien])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select revoquer_lien_partage($1)', [lien]);
    await expect(anonyme('select ouvrir_lien_partage($1)', [jeton])).rejects.toThrow(/expiré/);
    const r = await valeur(gerant, 'select creer_lien_partage($1, 1)', [piece]);
    await db.query("update liens_partage set cree_le = now() - interval '3 hours', expire_le = now() - interval '1 hour' where id = $1", [r.id]);
    await expect(anonyme('select ouvrir_lien_partage($1)', [r.jeton])).rejects.toThrow(/expiré/);
  });

  test('un document confidentiel ou archivé ne se partage pas', async () => {
    const conf = await valeur(gerant, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'document_vente', objet_id: facture, nom: 'Secret.pdf', contenu: pdf, confidentiel: true })]);
    await expect(comme(gerant, 'select creer_lien_partage($1, 24)', [conf])).rejects.toThrow(/confidentiel/);
    const r = await valeur(gerant, 'select creer_lien_partage($1, 24)', [piece]);
    await comme(gerant, "select archiver_piece_jointe($1, 'Remplacé')", [piece]);
    await expect(anonyme('select ouvrir_lien_partage($1)', [r.jeton])).rejects.toThrow(/expiré/);
  });
});
