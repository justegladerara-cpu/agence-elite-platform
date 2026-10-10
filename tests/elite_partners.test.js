import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Elite Partners : partenaires, modèles de licence, clés d'activation, appareils et commissions sur 3 niveaux.
let db;
let admin;
let paul;
let jean;
let luc;
let clientJean;
let intrus;
let pPaul;
let pJean;
let pLuc;
let modeles;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const commissions = async (evenement) => (await db.query(
  'select niveau, partenaire_id, taux::float, montant::float from partenaire_commissions where licence_evenement_id = $1 order by niveau', [evenement],
)).rows;
const evenement = async (reference) => (await db.query('select id from licence_evenements where reference = $1', [reference.toUpperCase()])).rows[0].id;
const modele = (nom) => modeles.find((m) => m.nom.startsWith(nom)).id;

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@partners.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  paul = await utilisateur('paul@partners.test');
  jean = await utilisateur('jean@partners.test');
  luc = await utilisateur('luc@partners.test');
  clientJean = await utilisateur('client@partners.test');
  intrus = await utilisateur('intrus@partners.test');
  modeles = (await db.query('select id, nom, formule, montant::float, frais_installation::float, appareils_max from licence_modeles order by ordre')).rows;
});

afterAll(async () => db.close());

describe('modèles et réglages', () => {
  test('quatre modèles de départ reprennent les prix de l’offre, sans prix dans le code', async () => {
    expect(modeles.map((m) => m.formule)).toEqual(['essai', 'mensuel', 'annuel', 'acquisition']);
    const essai = modeles[0];
    expect(essai.montant).toBe(0);
    expect(essai.frais_installation).toBe(50000);
    expect(modeles[1].montant).toBe(25000);
    expect(modeles[3].montant).toBe(450000);
    const r = (await db.query('select taux_niveau1::float t1, taux_niveau2::float t2, taux_niveau3::float t3 from partenaires_reglages')).rows[0];
    expect(r).toEqual({ t1: 20, t2: 5, t3: 2 });
  });

  test('seul le super admin règle les taux et crée des modèles', async () => {
    await expect(comme(paul, "select enregistrer_reglages_partenaires('{\"taux_niveau1\": 50}'::jsonb)")).rejects.toThrow(/super administrateurs/);
    await expect(comme(admin, "select enregistrer_reglages_partenaires('{\"taux_niveau1\": 90}'::jsonb)")).rejects.toThrow();
    await expect(comme(paul, 'select enregistrer_modele_licence($1::jsonb)', [JSON.stringify({ nom: 'X', offre_id: 'commerce-complet', formule: 'mensuel' })]))
      .rejects.toThrow(/super administrateurs/);
  });
});

describe('inscription et réseau', () => {
  test('Paul est créé par Agence Elite, Jean et Luc s’inscrivent avec un code de parrain', async () => {
    pPaul = await valeur(admin, 'select enregistrer_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Paul Mbemba', email: 'paul@partners.test', telephone: '060000001' })]);
    const paulLigne = (await db.query('select * from partenaires where id = $1', [pPaul])).rows[0];
    expect(paulLigne.statut).toBe('actif');
    expect(paulLigne.user_id).toBe(paul);
    expect(paulLigne.code).toMatch(/^PAULM[A-Z2-9]{3}$/);

    await expect(comme(jean, 'select devenir_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Jean', telephone: '060000002', parrain: 'INCONNU' })]))
      .rejects.toThrow(/parrain inconnu/);
    const r = await valeur(jean, 'select devenir_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Jean Nkounkou', telephone: '060000002', parrain: paulLigne.code })]);
    pJean = r.id;
    expect(r.statut).toBe('en_attente');
    await expect(comme(jean, 'select devenir_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Jean', telephone: '060000002' })])).rejects.toThrow(/déjà inscrit/);
    // Un partenaire en attente ne sert pas de parrain.
    const codeJean = (await db.query('select code from partenaires where id = $1', [pJean])).rows[0].code;
    await expect(comme(luc, 'select devenir_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Luc', telephone: '060000003', parrain: codeJean })])).rejects.toThrow(/parrain inconnu/);
    await comme(admin, "select definir_statut_partenaire($1, 'actif')", [pJean]);
    pLuc = (await valeur(luc, 'select devenir_partenaire($1::jsonb)', [JSON.stringify({ nom: 'Luc Samba', telephone: '060000003', parrain: codeJean })])).id;
    await comme(admin, "select definir_statut_partenaire($1, 'actif')", [pLuc]);
    // Les super admins sont prévenus des inscriptions.
    expect(Number((await db.query("select count(*) n from notifications where user_id = $1 and type = 'partenaires.info'", [admin])).rows[0].n)).toBe(2);
  });

  test('aucune boucle de parrainage', async () => {
    await expect(comme(admin, 'select enregistrer_partenaire($1::jsonb)', [JSON.stringify({ id: pPaul, nom: 'Paul Mbemba', parrain_id: pLuc })]))
      .rejects.toThrow(/boucle/);
  });

  test('personne ne lit ni n’écrit les tables directement', async () => {
    expect(await comme(jean, 'select * from partenaires')).toHaveLength(0);
    await expect(comme(jean, "update partenaires set statut = 'actif'")).rejects.toThrow(/permission denied/);
    await expect(comme(jean, 'insert into partenaire_commissions(partenaire_id) values ($1)', [pJean])).rejects.toThrow(/permission denied/);
    expect((await comme(admin, 'select * from partenaires')).length).toBe(3);
  });
});

describe('clés, activation et appareils', () => {
  let etabClient;
  let cle;

  test('une clé n’est générée que par le super admin, pour un partenaire actif', async () => {
    await expect(comme(jean, 'select generer_cles_licence($1, 1)', [modele('Essai')])).rejects.toThrow(/super administrateurs/);
    const cles = await valeur(admin, "select generer_cles_licence($1, 3, $2, 'Chez Mama', '069999999')", [modele('Essai'), pJean]);
    expect(cles).toHaveLength(3);
    expect(cles[0]).toMatch(/^ELITE-COM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(new Set(cles).size).toBe(3);
    [cle] = cles;
  });

  test('le client crée son entreprise avec la clé : essai d’un mois, client rattaché au partenaire, pas de commission', async () => {
    await expect(comme(clientJean, "select activer_cle_licence('ELITE-COM-AAAA-AAAA', null, '{\"entreprise\":\"X\",\"etablissement\":\"Y\"}'::jsonb)"))
      .rejects.toThrow(/inconnue/);
    const r = await valeur(clientJean, "select activer_cle_licence($1, null, $2::jsonb)", [cle.toLowerCase(), JSON.stringify({ entreprise: 'Chez Mama SARL', etablissement: 'Chez Mama', ville: 'Brazzaville' })]);
    etabClient = r.etablissement_id;
    expect(r.formule).toBe('essai');
    const licence = (await db.query("select * from licences where etablissement_id = $1 and statut = 'active'", [etabClient])).rows[0];
    expect(licence.formule).toBe('essai');
    expect(licence.appareils_max).toBe(1);
    expect(licence.note).toMatch(/installation 50000/);
    expect((await db.query('select role_id from etablissement_membres where etablissement_id = $1 and user_id = $2', [etabClient, clientJean])).rows[0].role_id).toBe('gerant');
    expect((await db.query('select partenaire_id from partenaire_clients where etablissement_id = $1', [etabClient])).rows[0].partenaire_id).toBe(pJean);
    expect(await commissions(await evenement(cle))).toEqual([]);
    await expect(comme(intrus, "select activer_cle_licence($1, null, '{\"entreprise\":\"Autre\",\"etablissement\":\"Autre\"}'::jsonb)", [cle]))
      .rejects.toThrow(/déjà utilisée/);
  });

  test('un seul ordinateur : le second est refusé jusqu’à ce que le partenaire libère la place', async () => {
    const a1 = 'ordinateur-caisse-0001';
    const a2 = 'ordinateur-bureau-0002';
    expect((await valeur(clientJean, 'select verifier_appareil($1, $2, $3)', [etabClient, a1, 'Caisse'])).autorise).toBe(true);
    expect((await valeur(clientJean, 'select verifier_appareil($1, $2)', [etabClient, a1])).autorise).toBe(true);
    expect((await valeur(clientJean, 'select verifier_appareil($1, $2)', [etabClient, a2])).autorise).toBe(false);
    const appareil = (await db.query('select id from licence_appareils where etablissement_id = $1 and actif', [etabClient])).rows[0].id;
    await expect(comme(luc, 'select retirer_appareil_licence($1)', [appareil])).rejects.toThrow(/partenaire du client/);
    await expect(comme(clientJean, 'select retirer_appareil_licence($1)', [appareil])).rejects.toThrow(/partenaire du client/);
    await comme(jean, 'select retirer_appareil_licence($1)', [appareil]);
    expect((await valeur(clientJean, 'select verifier_appareil($1, $2)', [etabClient, a2])).autorise).toBe(true);
    // Un non-membre n'est pas contrôlé (et n'enregistre rien).
    expect((await valeur(intrus, 'select verifier_appareil($1, $2)', [etabClient, 'ordinateur-intrus-0003'])).controle).toBe(false);
  });

  test('passage au mensuel avec une clé : 20 % au vendeur ; le parrain Paul (rang Partenaire) ne touche rien', async () => {
    const [mensuelle] = await valeur(admin, 'select generer_cles_licence($1, 1, $2)', [modele('Mensuel'), pJean]);
    await expect(comme(intrus, 'select activer_cle_licence($1, $2)', [mensuelle, etabClient])).rejects.toThrow(/responsable/);
    await comme(clientJean, 'select activer_cle_licence($1, $2)', [mensuelle, etabClient]);
    expect(await commissions(await evenement(mensuelle))).toEqual([
      { niveau: 1, partenaire_id: pJean, taux: 20, montant: 5000 },
    ]);
  });

  test('renouvellement : la commission suit, tant que le client paie', async () => {
    const licence = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [etabClient])).rows[0].id;
    await comme(admin, "select renouveler_licence($1, null, 25000, 'MM-1')", [licence]);
    expect((await commissions(await evenement('MM-1'))).map((c) => c.montant)).toEqual([5000]);
  });

  test('niveaux 2 et 3 selon les rangs : Bronze ouvre le niveau 2, Argent le niveau 3', async () => {
    // Paul atteint Argent : 10 clients actifs et 2 partenaires actifs dans son équipe directe.
    await comme(admin, "select enregistrer_reglages_partenaires('{\"rangs\": [{\"id\":\"partenaire\",\"nom\":\"Partenaire\",\"clients\":0,\"equipe\":0,\"bonus\":0,\"niveaux\":1},{\"id\":\"bronze\",\"nom\":\"Bronze\",\"clients\":1,\"equipe\":0,\"bonus\":0,\"niveaux\":2},{\"id\":\"argent\",\"nom\":\"Argent\",\"clients\":1,\"equipe\":1,\"bonus\":2,\"niveaux\":3}]}'::jsonb)");
    const [pourPaul] = await valeur(admin, 'select generer_cles_licence($1, 1, $2)', [modele('Annuel'), pPaul]);
    await (valeur(intrus, "select activer_cle_licence($1, null, '{\"entreprise\":\"Boutique Paul\",\"etablissement\":\"Boutique\"}'::jsonb)", [pourPaul]));
    // Paul : 1 client actif + Jean actif => Argent (bonus +2 sur ses propres ventes).
    expect((await commissions(await evenement(pourPaul)))[0]).toMatchObject({ niveau: 1, partenaire_id: pPaul, taux: 22, montant: 33000 });
    // Jean : 1 client actif => Bronze ; Luc vend une acquisition.
    const [pourLuc] = await valeur(admin, 'select generer_cles_licence($1, 1, $2)', [modele('Acquisition'), pLuc]);
    await (valeur(intrus, "select activer_cle_licence($1, null, '{\"entreprise\":\"Client Luc\",\"etablissement\":\"Magasin\"}'::jsonb)", [pourLuc]));
    expect(await commissions(await evenement(pourLuc))).toEqual([
      { niveau: 1, partenaire_id: pLuc, taux: 20, montant: 90000 },
      { niveau: 2, partenaire_id: pJean, taux: 5, montant: 22500 },
      { niveau: 3, partenaire_id: pPaul, taux: 2, montant: 9000 },
    ]);
  });

  test('pas de commission pour un partenaire sur son propre établissement', async () => {
    const [pourSoi] = await valeur(admin, 'select generer_cles_licence($1, 1, $2)', [modele('Mensuel'), pLuc]);
    await (valeur(luc, "select activer_cle_licence($1, null, '{\"entreprise\":\"Luc lui-même\",\"etablissement\":\"Chez Luc\"}'::jsonb)", [pourSoi]));
    expect(await commissions(await evenement(pourSoi))).toEqual([]);
  });

  test('une clé bloquée suspend la licence activée', async () => {
    const k = (await db.query("select id, licence_id from licence_cles where statut = 'activee' and partenaire_id = $1 order by activee_le limit 1", [pPaul])).rows[0];
    await expect(comme(admin, "select bloquer_cle_licence($1, '')", [k.id])).rejects.toThrow(/motif/);
    await comme(admin, "select bloquer_cle_licence($1, 'Impayé')", [k.id]);
    expect((await db.query('select statut from licences where id = $1', [k.licence_id])).rows[0].statut).toBe('suspendue');
  });
});

describe('paiement des commissions', () => {
  test('validation après le délai, puis paiement Mobile Money tracé', async () => {
    await expect(comme(admin, "select payer_partenaire($1, 'mobile_money', 'MP-1')", [pJean])).rejects.toThrow(/Aucune commission validée/);
    await db.query("update partenaire_commissions set cree_le = now() - interval '31 days' where partenaire_id = $1", [pJean]);
    await expect(comme(admin, "select payer_partenaire($1, 'mobile_money', '')", [pJean])).rejects.toThrow(/référence/);
    const r = await valeur(admin, "select payer_partenaire($1, 'mobile_money', 'MP-2026-001')", [pJean]);
    expect(Number(r.montant)).toBe(5000 + 5000 + 22500);
    expect((await db.query("select count(*)::int n from partenaire_commissions where partenaire_id = $1 and statut <> 'payee'", [pJean])).rows[0].n).toBe(0);
    await expect(db.query('delete from partenaire_paiements')).rejects.toThrow();
    const c = (await db.query("select id from partenaire_commissions where statut = 'payee' limit 1")).rows[0].id;
    await expect(comme(admin, "select annuler_commission($1, 'Erreur')", [c])).rejects.toThrow(/non payée/);
  });
});

describe('espaces', () => {
  test('le partenaire voit ses gains et son équipe, jamais les clients de son équipe', async () => {
    const espace = await valeur(jean, 'select partenaire_espace()');
    expect(espace.partenaire.nom).toBe('Jean Nkounkou');
    expect(Number(espace.totaux.payee)).toBe(32500);
    expect(espace.clients.map((c) => c.etablissement)).toEqual(['Chez Mama']);
    expect(espace.equipe.map((f) => f.nom)).toEqual(['Luc Samba']);
    const origines = espace.commissions.map((c) => c.origine);
    expect(origines).toContain('Vente de Luc Samba');
    expect(origines).not.toContain('Magasin');
    expect(espace.cles.filter((k) => k.statut === 'disponible')).toHaveLength(2);
    expect((await valeur(intrus, 'select partenaire_espace()')).partenaire).toBeNull();
  });

  test('la vue Agence Elite est réservée à l’équipe', async () => {
    await expect(comme(jean, 'select partenaires_editeur()')).rejects.toThrow(/réservée/);
    const vue = await valeur(admin, 'select partenaires_editeur()');
    expect(vue.partenaires).toHaveLength(3);
    expect(vue.modeles).toHaveLength(4);
    expect(vue.clients.length).toBeGreaterThanOrEqual(4);
  });

  test('lien public : nom du partenaire et demande de contact, sans compte', async () => {
    const code = (await db.query('select code from partenaires where id = $1', [pJean])).rows[0].code;
    const anonyme = (sql, params) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows[0]);
    expect((await anonyme('select partenaire_public($1) r', [code.toLowerCase()])).r).toEqual({ code, nom: 'Jean Nkounkou' });
    expect((await anonyme("select partenaire_public('NIMPORTE') r", [])).r).toBeNull();
    await expect(anonyme("select demande_partenaire($1, '{\"nom\":\"A\"}'::jsonb)", [code])).rejects.toThrow(/nom/);
    expect((await anonyme("select demande_partenaire($1, '{\"nom\":\"Awa\",\"telephone\":\"066000000\",\"entreprise\":\"Boutique Awa\"}'::jsonb) r", [code])).r.ok).toBe(true);
    const demande = (await db.query('select id from partenaire_demandes')).rows[0].id;
    await expect(comme(luc, "select traiter_demande_partenaire($1, 'traitee')", [demande])).rejects.toThrow(/introuvable/);
    await comme(jean, "select traiter_demande_partenaire($1, 'traitee')", [demande]);
    expect(Number((await db.query("select count(*) n from notifications where user_id = $1 and type = 'partenaires.demande'", [jean])).rows[0].n)).toBe(1);
  });

  test('creer_etablissement reste réservé à l’équipe Agence Elite', async () => {
    const client = await valeur(admin, "select creer_client('Témoin')");
    await expect(comme(jean, "select creer_etablissement($1, 'commerce', 'Pirate')", [client])).rejects.toThrow(/Agence Elite/);
    const etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Témoin')", [client]);
    expect((await db.query("select formule from licences where etablissement_id = $1", [etab])).rows[0].formule).toBe('essai');
    await expect(comme(jean, "select initialiser_etablissement($1, 'commerce', 'Pirate')", [client])).rejects.toThrow(/permission denied/);
  });
});
