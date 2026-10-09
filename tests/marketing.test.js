import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Marketing (M03, Bêta) : segments, consentements par canal, campagnes figées à la préparation, envoi déclaré, droits.
let db;
let sa;
let gerant;
let commercial;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let segment;
let campagne;
const contacts = {};

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const rpc = (user, fn, p) => valeur(user, `select ${fn}($1, $2::jsonb)`, [etab, json(p)]);
const consentir = (user, contact, canal, accepte = true) => valeur(user, 'select definir_consentement($1, $2, $3, $4, $5)', [etab, contact, canal, accepte, 'Formulaire en boutique']);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@mk.test');
  gerant = await utilisateur('gerant@mk.test');
  commercial = await utilisateur('commercial@mk.test');
  lecteur = await utilisateur('lecteur@mk.test');
  autreGerant = await utilisateur('autre@mk.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Marketing Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Marketing Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  for (const m of ['crm_pipeline', 'marketing']) {
    await comme(sa, 'select accorder_module($1, $2, true)', [etab, m]);
    await comme(sa, 'select definir_module_etablissement($1, $2, true)', [etab, m]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, commercial, lecteur, autreEtab, autreGerant]
  );
  for (const [cle, c] of Object.entries({
    a: { nom: 'Client A', type: 'client', email: 'a@exemple.test', telephone: '+242 06 000 00 01' },
    b: { nom: 'Client B', type: 'client', email: 'pas-un-email', telephone: '+242 06 000 00 02' },
    c: { nom: 'Prospect C', type: 'prospect', email: 'c@exemple.test' },
    f: { nom: 'Fournisseur F', type: 'fournisseur', email: 'f@exemple.test' },
  })) contacts[cle] = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json(c)]);
});

afterAll(async () => db.close());

describe('marketing', () => {
  test('consentements : par canal, avec source, contact du même établissement', async () => {
    await consentir(commercial, contacts.a, 'email');
    await consentir(commercial, contacts.a, 'sms');
    await consentir(commercial, contacts.b, 'email');
    await consentir(commercial, contacts.c, 'email', false);
    await consentir(commercial, contacts.f, 'email');
    await expect(valeur(commercial, 'select definir_consentement($1, $2, $3, true, $4)', [etab, contacts.a, 'email', ' '])).rejects.toThrow(/comment le contact/);
    await expect(valeur(commercial, 'select definir_consentement($1, $2, $3, true, $4)', [etab, contacts.a, 'pigeon', 'x'])).rejects.toThrow(/Canal inconnu/);
    await expect(consentir(lecteur, contacts.a, 'email')).rejects.toThrow(/Permission refusée/);
    const ailleurs = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Ailleurs', type: 'client' })]);
    await expect(consentir(commercial, ailleurs, 'email')).rejects.toThrow(/Contact introuvable/);
  });

  test('segments : critères vérifiés, aperçu par canal', async () => {
    await expect(rpc(commercial, 'enregistrer_segment', { nom: 'X', criteres: { types: ['martien'] } })).rejects.toThrow(/Type de contact inconnu/);
    segment = await rpc(commercial, 'enregistrer_segment', { nom: 'Clients et prospects', criteres: { types: ['client', 'prospect'] } });
    await expect(rpc(commercial, 'enregistrer_segment', { nom: 'Clients et prospects' })).rejects.toThrow(/existe déjà/);
    const apercu = await valeur(lecteur, 'select apercu_segment($1, $2::jsonb)', [etab, json({ types: ['client', 'prospect'] })]);
    expect(apercu).toEqual({ contacts: 3, email: 1, sms: 1, whatsapp: 0 });
    expect(await valeur(lecteur, 'select apercu_segment($1, $2::jsonb)', [etab, json({ acheteurs_jours: 30 })])).toMatchObject({ contacts: 0 });
  });

  test('campagne : brouillon modifiable, préparation fige les destinataires consentants', async () => {
    await expect(rpc(commercial, 'enregistrer_campagne', { nom: 'Promo', canal: 'email', segment_id: segment, message: 'Bonjour' })).rejects.toThrow(/objet/);
    campagne = await rpc(commercial, 'enregistrer_campagne', { nom: 'Promo', canal: 'email', segment_id: segment, objet: 'Offre', message: 'Bonjour {nom}' });
    expect((await db.query('select numero, statut from mkt_campagnes where id = $1', [campagne])).rows[0]).toEqual({ numero: 'CP-00001', statut: 'brouillon' });
    expect(await valeur(commercial, 'select preparer_campagne($1)', [campagne])).toEqual({ destinataires: 1 });
    const dest = (await db.query('select nom, coordonnee from mkt_destinataires where campagne_id = $1', [campagne])).rows;
    expect(dest).toEqual([{ nom: 'Client A', coordonnee: 'a@exemple.test' }]);
    await expect(rpc(commercial, 'enregistrer_campagne', { id: campagne, nom: 'Promo 2', canal: 'email', segment_id: segment, objet: 'O', message: 'M' })).rejects.toThrow(/déjà préparée/);
    await expect(valeur(commercial, 'select preparer_campagne($1)', [campagne])).rejects.toThrow(/déjà préparée/);
    // Retrait du consentement après préparation : la liste reste figée, mais une nouvelle campagne n'inclut plus le contact.
    await consentir(commercial, contacts.a, 'email', false);
    const autre = await rpc(commercial, 'enregistrer_campagne', { nom: 'Relance', canal: 'email', segment_id: segment, objet: 'O', message: 'M' });
    await expect(valeur(commercial, 'select preparer_campagne($1)', [autre])).rejects.toThrow(/Aucun destinataire/);
    await valeur(commercial, "select annuler_campagne($1, 'Plus personne')", [autre]);
  });

  test('envoi déclaré : seulement une campagne prête, avec note', async () => {
    await expect(valeur(commercial, "select declarer_envoi_campagne($1, '')", [campagne])).rejects.toThrow(/Indiquez/);
    await valeur(commercial, "select declarer_envoi_campagne($1, 'Envoyé depuis la messagerie de la boutique')", [campagne]);
    await expect(valeur(commercial, "select annuler_campagne($1, 'trop tard')", [campagne])).rejects.toThrow(/ne peut plus/);
    await expect(db.query('delete from mkt_destinataires where campagne_id = $1', [campagne])).rejects.toThrow();
    const k = await valeur(gerant, "select cockpit_marketing($1, current_date - 7, current_date)", [etab]);
    expect(k.kpis.find((x) => x.cle === 'envoyees').valeur).toBe(1);
    expect(k.kpis.find((x) => x.cle === 'touches').valeur).toBe(1);
  });

  test('isolation : autre établissement, accès direct refusé', async () => {
    expect(await comme(autreGerant, 'select id from mkt_campagnes where etablissement_id = $1', [etab])).toEqual([]);
    expect(await comme(autreGerant, 'select contact_id from mkt_consentements where etablissement_id = $1', [etab])).toEqual([]);
    await expect(valeur(autreGerant, 'select apercu_segment($1, $2::jsonb)', [etab, '{}'])).rejects.toThrow(/Permission refusée/);
    await expect(valeur(autreGerant, 'select preparer_campagne($1)', [campagne])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "insert into mkt_segments(etablissement_id, nom) values ($1, 'x')", [etab])).rejects.toThrow();
    await expect(comme(gerant, 'select * from mkt_contacts_segment($1, $2::jsonb)', [etab, '{}'])).rejects.toThrow(/permission denied/);
  });
});
