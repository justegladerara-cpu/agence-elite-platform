import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import {
  ajouterVente, chargerAvecCopie, controlerVenteLocale, delaiReprise, envoyerFile, estErreurPassagere, lireFile, lireRetirees,
  marquerEchecReseau, quantitesNonEnvoyees, reessayer, retirerVente, ventesAVerifier, ventesEnAttente,
} from '../src/modules/caisse/horsLigne.js';

// Caisse sans internet (migration 20261013000138) : même clé deux fois = une seule vente ; file de l'appareil.
let db;
let gerant;
let awa;
let binta;
let comptable;
let etab;
let article;
let caisseAwa;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const envoyer = (user, cle, session, extra = {}) => valeur(user,
  `select enregistrer_vente_hors_ligne($1, $2, $3, $4::jsonb, $5::jsonb, null, 0, null, $6::timestamptz, $7, $8::jsonb, $9::jsonb)`, [
    cle, etab, session, JSON.stringify(extra.lignes ?? [{ article_id: article, quantite: 1 }]),
    JSON.stringify(extra.paiements ?? [{ mode: 'especes', montant: 1000 }]), extra.vendueLe ?? null, extra.serveur ?? null,
    extra.offerts ? JSON.stringify(extra.offerts) : null, extra.pourboire ? JSON.stringify(extra.pourboire) : null,
  ]);
const nombreVentes = async () => Number((await db.query('select count(*) from ventes where etablissement_id = $1', [etab])).rows[0].count);
const CLE_A = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@horsligne.test');
  gerant = await utilisateur('gerant@horsligne.test');
  awa = await utilisateur('awa@horsligne.test');
  binta = await utilisateur('binta@horsligne.test');
  comptable = await utilisateur('comptable@horsligne.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Hors Ligne Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Coupure')", [client]);
  await db.query(`insert into etablissement_membres(etablissement_id, user_id, role_id)
    values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($1, $5, 'comptable')`, [etab, gerant, awa, binta, comptable]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière test', prix_vente: 1000, suivi_stock: false })]);
  caisseAwa = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('enregistrer_vente_hors_ligne', () => {
  test('la même clé envoyée deux fois ne crée qu’une vente', async () => {
    const avant = await nombreVentes();
    const premier = await envoyer(awa, CLE_A, caisseAwa, { serveur: 'Alex', pourboire: { montant: 500, mode: 'especes' } });
    expect(premier.deja_recue).toBe(false);
    expect(premier.avertissements).toEqual([]);
    const second = await envoyer(awa, CLE_A, caisseAwa, { serveur: 'Alex', pourboire: { montant: 500, mode: 'especes' } });
    expect(second.deja_recue).toBe(true);
    expect(second.vente_id).toBe(premier.vente_id);
    expect(second.numero).toBe(premier.numero);
    expect(await nombreVentes()).toBe(avant + 1);
    // Servi par et pourboire : une seule fois aussi.
    const vente = (await db.query('select servi_par, cle_hors_ligne from ventes where id = $1', [premier.vente_id])).rows[0];
    expect(vente).toEqual({ servi_par: 'Alex', cle_hors_ligne: CLE_A });
    expect(Number((await db.query('select count(*) from pourboires where vente_id = $1', [premier.vente_id])).rows[0].count)).toBe(1);
    expect(Number((await db.query('select count(*) from paiements where vente_id = $1', [premier.vente_id])).rows[0].count)).toBe(1);
  });

  test('l’heure réelle de la vente est gardée, bornée à la période de la caisse', async () => {
    await db.transaction(async (tx) => {
      await tx.query("set local session_replication_role = 'replica'");
      await tx.query("update sessions_caisse set ouverte_le = now() - interval '3 hours' where id = $1", [caisseAwa]);
    });
    const ilYa1h = new Date(Date.now() - 3600 * 1000).toISOString();
    const r = await envoyer(awa, '22222222-2222-4222-8222-222222222222', caisseAwa, { vendueLe: ilYa1h });
    const date = (await db.query('select cree_le from ventes where id = $1', [r.vente_id])).rows[0].cree_le;
    expect(Math.abs(new Date(date).getTime() - new Date(ilYa1h).getTime())).toBeLessThan(2000);
    // Avant l'ouverture de la caisse : ramenée à l'ouverture ; dans le futur : maintenant.
    const avant = await envoyer(awa, '33333333-3333-4333-8333-333333333333', caisseAwa, { vendueLe: '2020-01-01T00:00:00Z' });
    const ouverture = (await db.query('select ouverte_le from sessions_caisse where id = $1', [caisseAwa])).rows[0].ouverte_le;
    expect((await db.query('select cree_le from ventes where id = $1', [avant.vente_id])).rows[0].cree_le).toEqual(ouverture);
    const futur = await envoyer(awa, '44444444-4444-4444-8444-444444444444', caisseAwa, { vendueLe: '2099-01-01T00:00:00Z' });
    expect(new Date((await db.query('select cree_le from ventes where id = $1', [futur.vente_id])).rows[0].cree_le).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('les droits ne changent pas : caisse d’une autre personne, rôle sans caisse, anonyme', async () => {
    await expect(envoyer(binta, '55555555-5555-4555-8555-555555555555', caisseAwa)).rejects.toThrow(/caisse est celle d'une autre personne/);
    await expect(envoyer(comptable, '66666666-6666-4666-8666-666666666666', caisseAwa)).rejects.toThrow(/Permission refusée|permission/i);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query(
      "select enregistrer_vente_hors_ligne('77777777-7777-4777-8777-777777777777', $1, $2, '[]'::jsonb)", [etab, caisseAwa],
    ))).rejects.toThrow(/permission denied/i);
    // Une autre caissière ne récupère pas la vente d'Awa avec sa clé ; le responsable peut.
    await expect(envoyer(binta, CLE_A, caisseAwa)).rejects.toThrow(/Permission refusée/);
    expect((await envoyer(gerant, CLE_A, caisseAwa)).deja_recue).toBe(true);
  });

  test('refus de caisse (stock, crédit sans client) : rien n’est enregistré, la clé reste libre', async () => {
    const suivi = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Whisky rare', prix_vente: 1000, suivi_stock: true })]);
    const avant = await nombreVentes();
    const cle = '88888888-8888-4888-8888-888888888888';
    await expect(envoyer(awa, cle, caisseAwa, { lignes: [{ article_id: suivi, quantite: 1 }] })).rejects.toThrow(/Stock insuffisant/);
    await expect(envoyer(awa, cle, caisseAwa, { paiements: [] })).rejects.toThrow(/Vente à crédit/);
    expect(await nombreVentes()).toBe(avant);
    expect((await envoyer(awa, cle, caisseAwa)).deja_recue).toBe(false);
  });

  test('un complément refusé (offert sans droit) ne bloque pas la vente : avertissement', async () => {
    const r = await envoyer(awa, '99999999-9999-4999-8999-999999999999', caisseAwa, {
      lignes: [{ article_id: article, quantite: 1, remise: 1000 }], paiements: [],
      offerts: [{ article_id: article, quantite: 1, raison: 'Client fidèle' }],
    });
    expect(r.deja_recue).toBe(false);
    expect(r.avertissements[0]).toMatch(/Raison de l'offert non enregistrée/);
  });

  test('la clé posée ne se modifie plus', async () => {
    await expect(db.query("update ventes set cle_hors_ligne = gen_random_uuid() where cle_hors_ligne = $1", [CLE_A]))
      .rejects.toThrow(/ne peut pas être modifiée/);
  });
});

// Stockage en mémoire, comme localStorage.
function memoire() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const vente = (cle, session = 's1', utilisateurId = 'u1') => ({
  params: { p_cle: cle, p_session_id: session, p_lignes: [{ article_id: 'a1', quantite: 2 }] },
  utilisateur_id: utilisateurId,
  ticket: { total: 2000 },
});

describe('file des ventes sur l’appareil', () => {
  test('ajouter, lister, envoyer dans l’ordre, retirer seulement après réception', async () => {
    const stockage = memoire();
    ajouterVente('e1', vente('k1'), { stockage });
    ajouterVente('e1', vente('k2'), { stockage });
    ajouterVente('e1', vente('k1'), { stockage });
    expect(lireFile('e1', stockage).map((v) => v.cle)).toEqual(['k1', 'k2']);
    expect(ventesEnAttente(lireFile('e1', stockage), 's1')).toHaveLength(2);
    expect(ventesEnAttente(lireFile('e1', stockage), 'autre')).toHaveLength(0);
    expect(quantitesNonEnvoyees(lireFile('e1', stockage))).toEqual({ a1: 4 });
    const appels = [];
    const api = { rpc: async (nom, args) => { appels.push([nom, args.p_cle]); return { vente_id: args.p_cle }; } };
    const bilan = await envoyerFile({ etab: 'e1', api, utilisateurId: 'u1', stockage });
    expect(bilan).toEqual({ envoyees: 2, aVerifier: 0, coupure: false });
    expect(appels).toEqual([['enregistrer_vente_hors_ligne', 'k1'], ['enregistrer_vente_hors_ligne', 'k2']]);
    expect(lireFile('e1', stockage)).toEqual([]);
  });

  test('coupure : la vente reste, attente croissante, l’ordre est gardé', async () => {
    const stockage = memoire();
    ajouterVente('e1', vente('k1'), { stockage });
    ajouterVente('e1', vente('k2'), { stockage });
    const api = { rpc: async () => { throw new Error('Failed to fetch'); } };
    const bilan = await envoyerFile({ etab: 'e1', api, utilisateurId: 'u1', stockage, maintenant: 1000 });
    expect(bilan.coupure).toBe(true);
    const [k1, k2] = lireFile('e1', stockage);
    expect(k1).toMatchObject({ cle: 'k1', statut: 'en_attente', essais: 1, prochain_essai: 1000 + delaiReprise(1) });
    expect(k2.essais).toBe(0);
    // Avant la fin de l'attente : rien ne part.
    const rien = { rpc: async () => { throw new Error('ne doit pas être appelé'); } };
    expect((await envoyerFile({ etab: 'e1', api: rien, utilisateurId: 'u1', stockage, maintenant: 1500 })).envoyees).toBe(0);
    marquerEchecReseau('e1', 'k1', { stockage, maintenant: 2000 });
    expect(lireFile('e1', stockage)[0].essais).toBe(2);
    expect([1, 2, 3, 10].map(delaiReprise)).toEqual([2000, 4000, 8000, 60000]);
  });

  test('refus de la caisse : « à vérifier » avec le message, les suivantes partent, rien n’est perdu', async () => {
    const stockage = memoire();
    ajouterVente('e1', vente('k1'), { stockage });
    ajouterVente('e1', vente('k2'), { stockage });
    const api = { rpc: async (_n, args) => { if (args.p_cle === 'k1') throw new Error('Stock insuffisant pour « Primus »'); return {}; } };
    const bilan = await envoyerFile({ etab: 'e1', api, utilisateurId: 'u1', stockage });
    expect(bilan).toEqual({ envoyees: 1, aVerifier: 1, coupure: false });
    const restantes = lireFile('e1', stockage);
    expect(restantes).toHaveLength(1);
    expect(ventesAVerifier(restantes)[0]).toMatchObject({ cle: 'k1', statut: 'a_verifier', message: 'Stock insuffisant pour « Primus »' });
    // Une vente à vérifier ne repart pas toute seule ; « Réessayer » la remet en file avec la même clé.
    expect((await envoyerFile({ etab: 'e1', api: { rpc: async () => ({}) }, utilisateurId: 'u1', stockage })).envoyees).toBe(0);
    reessayer('e1', 'k1', { stockage });
    expect(ventesEnAttente(lireFile('e1', stockage))).toHaveLength(1);
    // Retrait par un responsable : motif obligatoire, trace gardée.
    marquerEchecReseau('e1', 'k1', { stockage });
    expect(() => retirerVente('e1', 'k1', { par: 'g1', motif: ' ' }, { stockage })).toThrow(/pourquoi/);
    retirerVente('e1', 'k1', { par: 'g1', motif: 'Saisie dans Ventes d’un jour passé' }, { stockage });
    expect(lireFile('e1', stockage)).toEqual([]);
    expect(lireRetirees('e1', stockage)[0]).toMatchObject({ cle: 'k1', retiree_par: 'g1' });
  });

  test('seules les ventes de la personne connectée partent ; base pas prête = on réessaiera', async () => {
    const stockage = memoire();
    ajouterVente('e1', vente('k1', 's1', 'u2'), { stockage });
    ajouterVente('e1', vente('k2'), { stockage });
    const appels = [];
    await envoyerFile({ etab: 'e1', api: { rpc: async (_n, a) => { appels.push(a.p_cle); return {}; } }, utilisateurId: 'u1', stockage });
    expect(appels).toEqual(['k2']);
    expect(estErreurPassagere(new Error('Could not find the function public.enregistrer_vente_hors_ligne in the schema cache'))).toBe(true);
    expect(estErreurPassagere(new Error('JWT expired'))).toBe(true);
    expect(estErreurPassagere(new Error('Aucune caisse ouverte : ouvrez la caisse avant de vendre'))).toBe(false);
  });

  test('stockage plein ou interdit : erreur claire, jamais de perte silencieuse', () => {
    const plein = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(() => ajouterVente('e1', vente('k1'), { stockage: plein })).toThrow(/ne peut pas garder la vente/);
    expect(() => ajouterVente('e1', vente('k1'), { stockage: null })).toThrow(/ne peut pas garder la vente/);
    const casse = { getItem: () => '{pas du json', setItem: () => {}, removeItem: () => {} };
    expect(lireFile('e1', casse)).toEqual([]);
  });

  test('contrôle sur l’appareil : mêmes règles que la base', () => {
    const articles = { a1: { id: 'a1', nom: 'Primus', prix_vente: 1000, suivi_stock: true }, a2: { id: 'a2', nom: 'Eau', prix_vente: 500, suivi_stock: false } };
    const r = controlerVenteLocale({
      lignes: [{ article_id: 'a1', quantite: 2 }, { article_id: 'a2', quantite: 1, remise: 500 }], articles,
      paiements: [{ mode: 'especes', montant: 5000 }], stock: { a1: 5 },
    });
    expect(r).toMatchObject({ sousTotal: 2000, total: 2000, monnaie: 3000, paye: 2000, reste: 0 });
    expect(r.paiements).toEqual([{ mode: 'especes', montant: 2000, reference: null, statut: 'valide' }]);
    expect(() => controlerVenteLocale({ lignes: [], articles })).toThrow(/panier est vide/);
    expect(() => controlerVenteLocale({ lignes: [{ article_id: 'a1', quantite: 3 }], articles, paiements: [{ mode: 'especes', montant: 3000 }], stock: { a1: 2 } })).toThrow(/Stock insuffisant/);
    expect(controlerVenteLocale({ lignes: [{ article_id: 'a1', quantite: 3 }], articles, paiements: [{ mode: 'especes', montant: 3000 }], stock: { a1: 2 }, stockNegatif: true }).total).toBe(3000);
    expect(() => controlerVenteLocale({ lignes: [{ article_id: 'a2', quantite: 1 }], articles, paiements: [] })).toThrow(/Vente à crédit/);
    expect(controlerVenteLocale({ lignes: [{ article_id: 'a2', quantite: 1 }], articles, paiements: [], contactId: 'c1' }).reste).toBe(500);
    expect(() => controlerVenteLocale({ lignes: [{ article_id: 'a2', quantite: 1 }], articles, paiements: [{ mode: 'mobile_money', montant: 600 }] })).toThrow(/hors espèces/);
    expect(() => controlerVenteLocale({ lignes: [{ article_id: 'zz', quantite: 1 }], articles })).toThrow(/Article inconnu/);
  });

  test('copie de la caisse : reprise sans connexion après un rechargement', async () => {
    const stockage = memoire();
    const donnees = { articles: [{ id: 'a1', nom: 'Primus', photo: 'x'.repeat(5000) }], contacts: [{ id: 'c1', nom: 'Client', type: 'client', telephone: '06' }], commandesQr: 3 };
    expect(await chargerAvecCopie('e1:u1', async () => donnees, { stockage })).toBe(donnees);
    const copie = await chargerAvecCopie('e1:u1', async () => { throw new Error('Failed to fetch'); }, { stockage });
    expect(copie.articles[0]).toEqual({ id: 'a1', nom: 'Primus', photo: null });
    expect(copie.contacts[0]).toEqual({ id: 'c1', nom: 'Client', type: 'client' });
    expect(copie.commandesQr).toBe(0);
    // Erreur de la base (pas une coupure) : on ne masque rien.
    await expect(chargerAvecCopie('e1:u1', async () => { throw new Error('Permission refusée'); }, { stockage })).rejects.toThrow(/Permission refusée/);
    // Pas de copie : l'erreur reste.
    await expect(chargerAvecCopie('autre', async () => { throw new Error('Failed to fetch'); }, { stockage })).rejects.toThrow(/Failed to fetch/);
  });
});
