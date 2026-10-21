import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { PERMISSIONS_CONTINUITE, caisseContinue, etatLicence, peutEcrire } from '../src/noyau/continuite.js';

// Elite License Guard (migration 20261021000151) : moteur d'échéance, alertes, continuité de la caisse,
// demandes de renouvellement, Mon abonnement, écrans de l'équipe et des partenaires.
let db;
let admin;
let gerant;
let caissiere;
let partenaireUser;
let intrus;
let etab;
let article;
let licence;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
]);
// Place l'échéance de la licence de test à J+n (données fictives de la base de test uniquement).
const echeanceDans = async (jours) => {
  await db.query('update licences set debut = least(debut, current_date - 400), echeance = current_date + $2::int where id = $1', [licence, jours]);
};
// Seulement celles qui parlent de l'établissement de test (la base de test contient aussi les démos).
const notifications = async (user, type) => (await db.query(
  "select titre, texte, lien from notifications where user_id = $1 and type = $2 and (etablissement_id = $3 or titre like '%Boutique Guard%') order by cree_le",
  [user, type, etab],
)).rows;
const alertesDuTest = (r) => r.liste.filter((x) => x.etablissement_id === etab);
// Lance la tâche du jour J+decalage (en production : toujours aujourd'hui).
const alerter = async (decalage = 0, simulation = false) => (await db.query(
  'select alerter_echeances_licences($1, current_date + $2::int) r', [simulation, decalage],
)).rows[0].r;
const evenements = async () => Number((await db.query('select count(*) from licence_evenements where etablissement_id = $1', [etab])).rows[0].count);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@guard.test');
  gerant = await utilisateur('gerant@guard.test');
  caissiere = await utilisateur('awa@guard.test');
  partenaireUser = await utilisateur('partenaire@guard.test');
  intrus = await utilisateur('intrus@guard.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Guard Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Guard')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissiere]);
  licence = await valeur(admin, "select attribuer_licence($1, 'commerce-complet', 'mensuel', current_date, null, 25000, '{}', 'FICTIF-001')", [etab]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Savon guard', prix_vente: 500, suivi_stock: false })]);
  const p = await valeur(admin, 'select enregistrer_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Paul Guard', email: 'partenaire@guard.test', telephone: '060000099' })]);
  await comme(admin, 'select rattacher_client_partenaire($1, $2)', [etab, p]);
});

afterAll(async () => db.close());

describe('moteur d’échéance', () => {
  test('les états suivent les statuts réels et le délai de grâce de licence_valide', async () => {
    const etat = async (statut, formule, jours) => (await db.query(
      'select licence_etat($1, $2, current_date + $3::int) e', [statut, formule, jours],
    )).rows[0].e;
    expect(await etat('active', 'mensuel', 60)).toBe('a_jour');
    expect(await etat('active', 'mensuel', 20)).toBe('bientot');
    expect(await etat('active', 'mensuel', 3)).toBe('urgent');
    expect(await etat('active', 'mensuel', 0)).toBe('aujourdhui');
    expect(await etat('active', 'mensuel', -7)).toBe('grace');
    expect(await etat('active', 'mensuel', -8)).toBe('expiree');
    expect(await etat('active', 'essai', -1)).toBe('expiree');
    expect(await etat('suspendue', 'mensuel', 60)).toBe('suspendue');
    expect(await etat('terminee', 'mensuel', 60)).toBe('terminee');
    expect((await db.query("select licence_etat('active', 'acquisition', null) e")).rows[0].e).toBe('sans_echeance');
  });

  test('l’écran calcule le même état que la base', () => {
    const l = (jours, formule = 'mensuel', statut = 'active') => ({ statut, formule, echeance: '2026-01-01', jours_restants: jours });
    expect([60, 20, 3, 0, -7, -8].map((j) => etatLicence(l(j)))).toEqual(['a_jour', 'bientot', 'urgent', 'aujourdhui', 'grace', 'expiree']);
    expect(etatLicence(l(-1, 'essai'))).toBe('expiree');
    expect(etatLicence({ statut: 'active', formule: 'acquisition', echeance: null, jours_restants: null })).toBe('sans_echeance');
  });
});

describe('alertes', () => {
  test('la simulation liste sans rien écrire ni envoyer', async () => {
    await echeanceDans(11);
    const r = await alerter(0, true);
    const miennes = alertesDuTest(r);
    expect(r.simulation).toBe(true);
    expect(miennes).toHaveLength(1);
    expect(miennes[0].palier).toBe(15);
    expect(miennes[0].destinataires).toBe(1);
    expect(Number((await db.query('select count(*) from licence_alertes where etablissement_id = $1', [etab])).rows[0].count)).toBe(0);
    expect(await notifications(gerant, 'licence.echeance')).toEqual([]);
  });

  test('J-11 : une alerte au gérant et au partenaire, pas à la caissière ni encore à l’équipe', async () => {
    await alerter(0);
    const g = await notifications(gerant, 'licence.echeance');
    expect(g).toHaveLength(1);
    expect(g[0].titre).toMatch(/dans 11 jour/);
    expect(g[0].texte).toMatch(/ventes et vos encaissements continuent/);
    expect(g[0].lien).toBe('parametres/licence');
    expect(await notifications(caissiere, 'licence.echeance')).toEqual([]);
    expect(await notifications(partenaireUser, 'licence.echeance_partenaire')).toHaveLength(1);
    expect(await notifications(admin, 'licence.echeance_equipe')).toEqual([]);
  });

  test('jamais deux fois le même palier ; le palier suivant part une fois, avec l’équipe', async () => {
    await alerter(0);
    await alerter(1);
    expect(await notifications(gerant, 'licence.echeance')).toHaveLength(1);
    // Jour manqué : à J-6, le palier 7 part une seule fois (rattrapage), même lancé deux fois.
    await alerter(5);
    await alerter(5);
    expect(await notifications(gerant, 'licence.echeance')).toHaveLength(2);
    expect(await notifications(admin, 'licence.echeance_equipe')).toHaveLength(1);
    // Retour en arrière impossible : un palier moins urgent ne repart pas après un plus urgent.
    const a = (await db.query('select palier from licence_alertes where etablissement_id = $1 order by cree_le', [etab])).rows;
    expect(a.map((x) => x.palier)).toEqual([15, 7]);
    await expect(db.query('delete from licence_alertes where etablissement_id = $1', [etab])).rejects.toThrow();
  });

  test('une alerte ne crée jamais de paiement, de facture ni de renouvellement', async () => {
    const avant = await evenements();
    const echeance = (await db.query('select echeance from licences where id = $1', [licence])).rows[0].echeance;
    await alerter(6);
    await alerter(30);
    expect(await evenements()).toBe(avant);
    expect((await db.query('select echeance from licences where id = $1', [licence])).rows[0].echeance).toEqual(echeance);
  });

  test('licence suspendue ou réglage coupé : aucune alerte', async () => {
    await echeanceDans(2);
    await comme(admin, "select definir_statut_licence($1, 'suspendue', 'Test fictif')", [licence]);
    expect(alertesDuTest(await alerter(0, true))).toEqual([]);
    await comme(admin, "select definir_statut_licence($1, 'active', 'Test fictif')", [licence]);
    await comme(admin, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ actif: false })]);
    expect((await alerter(0, true)).actif).toBe(false);
    await comme(admin, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ actif: true })]);
  });

  test('l’envoi réel est réservé à la tâche planifiée ; la simulation à l’équipe', async () => {
    await expect(comme(gerant, 'select alerter_echeances_licences()')).rejects.toThrow(/permission denied/);
    await expect(comme(admin, 'select alerter_echeances_licences()')).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select simuler_alertes_echeances()')).rejects.toThrow();
    expect((await valeur(admin, 'select simuler_alertes_echeances()')).simulation).toBe(true);
  });
});

describe('continuité de la caisse', () => {
  let session;

  test('licence expirée (après la grâce) : la caisse vend, encaisse et tire son ticket Z', async () => {
    await echeanceDans(-20);
    expect((await db.query('select etablissement_autorise_ecriture($1) e', [etab])).rows[0].e).toBe(false);
    expect((await db.query('select caisse_continue($1) c', [etab])).rows[0].c).toBe(true);
    session = await valeur(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect((await vendre(caissiere, session)).numero).toBeTruthy();
    const z = await valeur(caissiere, 'select cloturer_caisse($1, 500)', [session]);
    expect(Number(z.total_ventes)).toBe(500);
  });

  test('le reste passe en consultation seule, comme avant', async () => {
    await expect(comme(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bloqué', prix_vente: 1 })]))
      .rejects.toThrow(/aucune écriture possible/);
  });

  test('une suspension manuelle de la licence ou de l’établissement bloque toujours la caisse', async () => {
    await comme(admin, "select definir_statut_licence($1, 'suspendue', 'Test fictif')", [licence]);
    await expect(comme(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab])).rejects.toThrow(/aucune écriture possible/);
    await comme(admin, "select definir_statut_licence($1, 'active', 'Test fictif')", [licence]);
    await comme(admin, "select definir_statut_etablissement($1, 'suspendu')", [etab]);
    expect((await db.query('select caisse_continue($1) c', [etab])).rows[0].c).toBe(false);
    await comme(admin, "select definir_statut_etablissement($1, 'actif')", [etab]);
  });

  test('l’écran applique la même règle et la même liste', async () => {
    const sql = (await db.query('select permissions_continuite() p')).rows[0].p;
    expect([...PERMISSIONS_CONTINUITE].sort()).toEqual([...sql].sort());
    const permissions = (await db.query('select id from permissions where id = any($1)', [sql])).rows.map((r) => r.id);
    expect(permissions.sort()).toEqual([...sql].sort());
    const e = { ecriture: false, statut: 'actif', client_statut: 'actif', role: 'employe', licence: { statut: 'active', valide: false } };
    expect(caisseContinue(e)).toBe(true);
    expect(peutEcrire(e, 'caisse.utiliser')).toBe(true);
    expect(peutEcrire(e, 'articles.gerer')).toBe(false);
    expect(peutEcrire({ ...e, licence: { statut: 'suspendue' } }, 'caisse.utiliser')).toBe(false);
    expect(peutEcrire({ ...e, statut: 'suspendu' }, 'caisse.utiliser')).toBe(false);
    expect(peutEcrire({ ...e, role: 'support' }, 'caisse.utiliser')).toBe(false);
  });
});

describe('demandes de renouvellement et Mon abonnement', () => {
  let demande;

  test('seul un responsable demande, même licence expirée ; une seule demande ouverte', async () => {
    await expect(comme(caissiere, "select demander_renouvellement_licence($1, 'annuel')", [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(intrus, "select demander_renouvellement_licence($1, 'annuel')", [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select demander_renouvellement_licence($1, 'gratuit')", [etab])).rejects.toThrow(/Formule invalide/);
    const avant = await evenements();
    demande = await valeur(gerant, "select demander_renouvellement_licence($1, 'annuel', 'Passer à l’année', '060000010')", [etab]);
    expect(await evenements()).toBe(avant);
    await expect(comme(gerant, "select demander_renouvellement_licence($1, 'mensuel')", [etab])).rejects.toThrow(/déjà en cours/);
    expect((await notifications(admin, 'licence.demande'))[0].titre).toMatch(/Boutique Guard/);
    expect(await notifications(partenaireUser, 'licence.demande_partenaire')).toHaveLength(1);
  });

  test('chacun ne voit que les demandes de son établissement', async () => {
    expect(await comme(gerant, 'select id from licence_demandes')).toHaveLength(1);
    expect(await comme(caissiere, 'select id from licence_demandes')).toEqual([]);
    expect(await comme(intrus, 'select id from licence_demandes')).toEqual([]);
    expect(await comme(intrus, 'select id from licence_alertes')).toEqual([]);
  });

  test('« traitée » exige un renouvellement vraiment enregistré, avec sa référence', async () => {
    await expect(comme(gerant, "select traiter_demande_licence($1, 'traitee')", [demande])).rejects.toThrow();
    await expect(comme(admin, "select traiter_demande_licence($1, 'traitee')", [demande])).rejects.toThrow(/Aucun renouvellement/);
    await expect(comme(admin, "select traiter_demande_licence($1, 'abandonnee')", [demande])).rejects.toThrow(/motif/);
    await comme(admin, "select traiter_demande_licence($1, 'en_cours', 'Rappel prévu')", [demande]);
    await comme(admin, "select renouveler_licence($1, null, 25000, 'FICTIF-MM-002')", [licence]);
    await comme(admin, "select traiter_demande_licence($1, 'traitee', 'Paiement reçu')", [demande]);
    expect((await notifications(gerant, 'licence.demande_close'))[0].titre).toMatch(/renouvelé/);
    await expect(comme(admin, "select traiter_demande_licence($1, 'en_cours')", [demande])).rejects.toThrow(/déjà close/);
  });

  test('Mon abonnement : détail pour le responsable, l’essentiel pour l’équipe, rien pour un inconnu', async () => {
    const g = await valeur(gerant, 'select mon_abonnement($1)', [etab]);
    expect(g.responsable).toBe(true);
    expect(g.licence.etat).toBe('a_jour');
    expect(Number(g.licence.tarifs.mensuel)).toBeGreaterThanOrEqual(0);
    expect(g.historique.some((h) => h.reference === 'FICTIF-MM-002')).toBe(true);
    expect(g.demandes[0].statut).toBe('traitee');
    expect(g.partenaire.nom).toBe('Paul Guard');
    const c = await valeur(caissiere, 'select mon_abonnement($1)', [etab]);
    expect(c.responsable).toBe(false);
    expect(c.historique).toEqual([]);
    expect(c.licence.echeance).toBeTruthy();
    await expect(comme(intrus, 'select mon_abonnement($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('un renouvellement ouvre un nouveau cycle d’alertes', async () => {
    const ancienne = (await db.query('select count(*) from licence_alertes where etablissement_id = $1', [etab])).rows[0].count;
    const echeance = (await db.query('select echeance - current_date j from licences where id = $1', [licence])).rows[0].j;
    const r = alertesDuTest(await alerter(echeance - 5, true));
    expect(r).toHaveLength(1);
    expect(r[0].jours).toBe(5);
    expect(Number(ancienne)).toBeGreaterThan(0);
  });
});

describe('équipe Agence Elite et partenaires', () => {
  test('le calendrier et les réglages sont réservés à l’équipe', async () => {
    const v = await valeur(admin, 'select editeur_echeances()');
    expect(v.licences.some((l) => l.etablissement_id === etab)).toBe(true);
    expect(v.licences.every((l) => !('partenaire_user' in l))).toBe(true);
    expect(v.reglages.paliers).toContain(30);
    await expect(comme(gerant, 'select editeur_echeances()')).rejects.toThrow();
    await expect(comme(admin, "select editeur_echeances(current_date, current_date - 1)")).rejects.toThrow(/Période invalide/);
    await expect(comme(gerant, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ paliers: [1] })])).rejects.toThrow(/super administrateurs/);
    await comme(admin, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ paliers: [30, 7, 7, 0, -3] })]);
    expect((await db.query('select paliers from licence_alertes_reglages')).rows[0].paliers).toEqual([30, 7, 0, -3]);
    await expect(comme(admin, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ paliers: [] })])).rejects.toThrow(/palier/);
    await expect(comme(admin, 'select enregistrer_reglages_alertes_licences($1::jsonb)', [JSON.stringify({ paliers: [500] })])).rejects.toThrow();
    expect(await comme(gerant, 'select * from licence_alertes_reglages')).toEqual([]);
  });

  test('le partenaire voit les échéances de ses clients seulement', async () => {
    const liste = await valeur(partenaireUser, 'select partenaire_echeances()');
    expect(liste.map((l) => l.etablissement)).toEqual(['Boutique Guard']);
    await expect(comme(intrus, 'select partenaire_echeances()')).rejects.toThrow(/partenaires actifs/);
  });
});
