import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Livraisons (M05, Bêta) : création (libre, depuis une vente), tournée, avancement, preuve, encaissement, droits du livreur.
let db;
let sa;
let gerant;
let livreur;
let autreLivreur;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let riz;
let session;
let lv1;
let lv2;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const livraison = async (id) => (await db.query('select * from liv_livraisons where id = $1', [id])).rows[0];
const avancer = (user, id, statut, p = {}) => comme(user, 'select avancer_livraison($1, $2, $3::jsonb)', [id, statut, json(p)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@lv.test');
  gerant = await utilisateur('gerant@lv.test');
  livreur = await utilisateur('livreur@lv.test');
  autreLivreur = await utilisateur('livreur2@lv.test');
  lecteur = await utilisateur('lecteur@lv.test');
  autreGerant = await utilisateur('autre@lv.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Livraison Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Livraison Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, livreur, autreLivreur, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Client', type: 'client', telephone: '+242 06 111 11 11', adresse: 'Rue des Tests, Pointe-Noire' })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 25 kg', prix_vente: 18000, stock_initial: 10 })]);
  session = await valeur(gerant, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('livraisons', () => {
  test('sans le module : refusé ; rôle Livreur disponible', async () => {
    await expect(comme(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ destinataire: 'X', adresse: 'Y' })])).rejects.toThrow(/Permission refusée/);
    expect((await db.query("select modules_requis from roles where id = 'livreur'")).rows[0].modules_requis).toEqual(['livraisons']);
  });

  test('création : libre avec le client, depuis une vente (reste à payer repris), doublon refusé', async () => {
    await comme(sa, "select accorder_module($1, 'livraisons', true)", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'livraisons', true)", [etab]);
    const libre = await valeur(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ contact_id: client, livreur_id: livreur })]);
    lv1 = libre.id;
    expect(await livraison(lv1)).toMatchObject({ numero: 'LV-00001', destinataire: 'M. Client', adresse: 'Rue des Tests, Pointe-Noire', statut: 'a_preparer' });
    const vente = await valeur(gerant, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5)', [
      etab, session, json([{ article_id: riz, quantite: 1 }]), json([{ mode: 'especes', montant: 5000 }]), client]);
    const depuisVente = await valeur(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ source: 'vente', source_id: vente.vente_id })]);
    lv2 = depuisVente.id;
    expect(await livraison(lv2)).toMatchObject({ source_numero: vente.numero, montant_a_encaisser: '13000.00' });
    await expect(comme(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ source: 'vente', source_id: vente.vente_id })])).rejects.toThrow(/déjà prévue/);
    await expect(comme(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ destinataire: 'Sans adresse' })])).rejects.toThrow(/adresse/);
    await expect(comme(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ contact_id: client, livreur_id: lecteur })])).rejects.toThrow(/ne peut pas livrer/);
    await expect(comme(livreur, 'select creer_livraison($1, $2::jsonb)', [etab, json({ contact_id: client })])).rejects.toThrow(/Permission refusée/);
  });

  test('tournée : affecte les livraisons au livreur', async () => {
    const t = await valeur(gerant, 'select creer_tournee($1, $2::jsonb)', [etab, json({ livreur_id: autreLivreur, livraisons: [lv2] })]);
    expect(t).toMatchObject({ numero: 'TO-00001', livraisons: 1 });
    expect(await livraison(lv2)).toMatchObject({ livreur_id: autreLivreur, statut: 'prete' });
    await expect(comme(gerant, 'select creer_tournee($1, $2::jsonb)', [etab, json({ livreur_id: livreur, livraisons: [lv2] })])).rejects.toThrow(/plus disponible/);
  });

  test('le livreur ne voit et ne fait avancer que ses livraisons', async () => {
    expect((await comme(livreur, 'select id from liv_livraisons')).map((r) => r.id)).toEqual([lv1]);
    expect((await comme(lecteur, 'select id from liv_livraisons')).length).toBe(2);
    await expect(avancer(livreur, lv2, 'en_route')).rejects.toThrow(/pas confiée/);
    await expect(avancer(livreur, lv1, 'livree', { recu_par: 'X' })).rejects.toThrow(/en route/);
    await avancer(livreur, lv1, 'en_route');
    await expect(avancer(livreur, lv1, 'livree')).rejects.toThrow(/nom de la personne/);
    await avancer(livreur, lv1, 'echec', { motif: 'Absent' });
    await comme(gerant, "select replanifier_livraison($1, $2::jsonb)", [lv1, json({ date_prevue: '2026-12-01', livreur_id: livreur })]);
    await avancer(livreur, lv1, 'en_route');
    await avancer(livreur, lv1, 'livree', { recu_par: 'Mme Client' });
    expect(await livraison(lv1)).toMatchObject({ statut: 'livree', recu_par: 'Mme Client', tentatives: 2 });
  });

  test('encaissement à la livraison, tournée terminée, annulation', async () => {
    await avancer(autreLivreur, lv2, 'en_route');
    await expect(avancer(autreLivreur, lv2, 'livree', { recu_par: 'M. Client', montant_encaisse: 20000, mode: 'especes' })).rejects.toThrow(/Montant encaissé/);
    await avancer(autreLivreur, lv2, 'livree', { recu_par: 'M. Client', montant_encaisse: 13000, mode: 'mobile_money' });
    expect((await livraison(lv2)).montant_encaisse).toBe('13000.00');
    expect((await db.query("select statut from liv_tournees")).rows[0].statut).toBe('terminee');
    await expect(comme(gerant, "select annuler_livraison($1, 'trop tard')", [lv2])).rejects.toThrow(/close/);
    const lv3 = await valeur(gerant, 'select creer_livraison($1, $2::jsonb)', [etab, json({ destinataire: 'Mme Z', adresse: 'Quartier Test' })]);
    await comme(gerant, "select annuler_livraison($1, 'Client injoignable')", [lv3.id]);
  });

  test('isolation et écriture directe refusées', async () => {
    expect(await comme(autreGerant, 'select id from liv_livraisons')).toEqual([]);
    await expect(avancer(autreGerant, lv1, 'prete')).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "update liv_livraisons set statut = 'a_preparer' where id = $1", [lv1])).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select livreurs_etablissement($1)', [etab]))).rejects.toThrow(/permission denied/);
    expect((await valeur(autreGerant, 'select livreurs_etablissement($1)', [etab]))).toEqual([]);
    expect((await valeur(gerant, 'select livreurs_etablissement($1)', [etab])).length).toBe(3);
  });

  test('tableau de bord Livraisons', async () => {
    expect((await valeur(gerant, 'select cockpit_domaines($1)', [etab])).map((d) => d.id)).toContain('livraisons');
    const auj = new Date().toISOString().slice(0, 10);
    const c = await valeur(gerant, 'select cockpit_livraisons($1, $2::date - 6, $2::date)', [etab, auj]);
    expect(c.kpis.find((k) => k.cle === 'livrees').valeur).toBe(2);
  });
});
