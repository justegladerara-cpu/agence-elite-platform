import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import {
  PERMISSIONS_APRES_COUPURE, caisseContinue, dateFinLisible, licenceCoupee, peutEcrire, tempsRestant,
} from '../src/noyau/continuite.js';

// Heure de fin précise d'une licence (migration 20261022000154) : avant, tout marche ; après, consultation seule,
// plus de vente ni d'ouverture de caisse ni de stock ; les ventes hors ligne d'avant et le ticket Z restent possibles.
let db;
let admin;
let gerant;
let caissiere;
let etab;
let article;
let licence;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
]);
const finDans = (minutes) => db.query("update licences set fin_a = now() + make_interval(mins => $2::int) where id = $1", [licence, minutes]);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@fin.test');
  gerant = await utilisateur('gerant@fin.test');
  caissiere = await utilisateur('awa@fin.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Fin Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Fin')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissiere]);
  licence = await valeur(admin, "select attribuer_licence($1, 'commerce-complet', 'essai', current_date, current_date + 2, 0, '{}', 'FICTIF-FIN')", [etab]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Savon fin', prix_vente: 500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('heure de fin précise', () => {
  let session;

  test('sans heure de fin, rien ne change', async () => {
    expect((await db.query('select licence_coupee($1) c, licence_valide($1) v', [etab])).rows[0]).toEqual({ c: false, v: true });
  });

  test('avant l’heure : vente et gestion normales', async () => {
    await finDans(60);
    expect((await db.query('select licence_coupee($1) c, licence_valide($1) v', [etab])).rows[0]).toEqual({ c: false, v: true });
    session = await valeur(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect((await vendre(caissiere, session)).numero).toBeTruthy();
    const resume = (await db.query('select resume_licence($1) r', [etab])).rows[0].r;
    expect(resume.fin_a).toBeTruthy();
  });

  test('après l’heure : plus de vente, plus d’ouverture de caisse, plus de stock ni d’articles', async () => {
    await finDans(-1);
    expect((await db.query('select licence_coupee($1) c, licence_valide($1) v, caisse_continue($1) k', [etab])).rows[0])
      .toEqual({ c: true, v: false, k: false });
    await expect(vendre(caissiere, session)).rejects.toThrow(/Licence expirée : consultation seule/);
    await expect(comme(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab])).rejects.toThrow(/Licence expirée/);
    await expect(comme(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bloqué', prix_vente: 1 })]))
      .rejects.toThrow(/Licence expirée/);
  });

  test('les données restent lisibles ; le responsable tire le ticket Z de la caisse restée ouverte', async () => {
    const ventes = await comme(gerant, 'select count(*)::int n from ventes where etablissement_id = $1', [etab]);
    expect(ventes[0].n).toBe(1);
    await expect(comme(caissiere, 'select cloturer_caisse($1, 500)', [session])).rejects.toThrow(/Licence expirée/);
    const z = await valeur(gerant, 'select cloturer_caisse($1, 500)', [session]);
    expect(Number(z.total_ventes)).toBe(500);
  });

  test('la même liste d’exceptions côté écran et côté base', async () => {
    const sql = (await db.query('select permissions_apres_coupure() p')).rows[0].p;
    expect([...PERMISSIONS_APRES_COUPURE].sort()).toEqual([...sql].sort());
  });

  test('pas d’alerte quotidienne « la caisse continue » pour une licence à heure de fin', async () => {
    const r = (await db.query('select alerter_echeances_licences(true, current_date) r')).rows[0].r;
    expect(r.liste.filter((x) => x.etablissement_id === etab)).toEqual([]);
  });

  test('un renouvellement efface l’heure de fin et tout refonctionne', async () => {
    await db.query("update licences set formule = 'mensuel' where id = $1", [licence]);
    await comme(admin, "select renouveler_licence($1, current_date + 30, 25000, 'FICTIF-PAYE')", [licence]);
    expect((await db.query('select fin_a from licences where id = $1', [licence])).rows[0].fin_a).toBeNull();
    expect((await db.query('select licence_coupee($1) c, licence_valide($1) v', [etab])).rows[0]).toEqual({ c: false, v: true });
    const s = await valeur(caissiere, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect((await vendre(caissiere, s)).numero).toBeTruthy();
  });
});

describe('écran', () => {
  const base = { ecriture: true, statut: 'actif', client_statut: 'actif', role: 'employe' };
  const avec = (finMs) => ({ ...base, licence: { statut: 'active', valide: true, fin_a: new Date(finMs).toISOString() } });

  test('avant l’heure, tout reste permis ; après, consultation seule sauf rattrapage et Z', () => {
    const avant = avec(Date.now() + 3600000);
    expect(licenceCoupee(avant)).toBe(false);
    expect(peutEcrire(avant, 'caisse.utiliser')).toBe(true);
    expect(peutEcrire(avant, 'stock.gerer')).toBe(true);
    const apres = avec(Date.now() - 1000);
    expect(licenceCoupee(apres)).toBe(true);
    expect(caisseContinue({ ...apres, ecriture: false })).toBe(false);
    expect(peutEcrire(apres, 'caisse.utiliser')).toBe(false);
    expect(peutEcrire(apres, 'paiements.encaisser')).toBe(false);
    expect(peutEcrire(apres, 'stock.gerer')).toBe(false);
    expect(peutEcrire(apres, 'caisse.rattraper')).toBe(true);
    expect(peutEcrire(apres, 'cloture.cloturer')).toBe(true);
    expect(peutEcrire(apres, 'ventes.lire')).toBe(true);
  });

  test('textes : temps restant et date dans le fuseau de Brazzaville', () => {
    expect(tempsRestant(((1 * 24 + 22) * 60 + 14) * 60000 + 30000)).toBe('1 j 22 h 14 min');
    expect(tempsRestant(5 * 60000)).toBe('5 min');
    expect(dateFinLisible(Date.parse('2026-10-24T11:00:00Z'))).toBe('samedi 24 octobre à 12h00 (heure de Brazzaville)');
  });
});
