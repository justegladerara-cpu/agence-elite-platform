import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Assistant (M10, Bêta) : alertes calculées par la base, lecture seule, isolées par établissement et par droit.
let db;
let sa;
let gerant;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let riz;
let session;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const alertes = async (user = gerant) => (await valeur(user, 'select assistant_alertes($1)', [etab])).alertes;
const vendre = (remise = 0) => valeur(gerant, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, $5)', [
  etab, session, json([{ article_id: riz, quantite: 1 }]), json([{ mode: 'especes', montant: 1000 - remise }]), remise,
]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@as.test');
  gerant = await utilisateur('gerant@as.test');
  lecteur = await utilisateur('lecteur@as.test');
  autreGerant = await utilisateur('autre@as.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Boutique Assistant')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Assistant')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'lecteur'), ($4, $5, 'gerant')`,
    [etab, gerant, lecteur, autreEtab, autreGerant]
  );
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Riz 1 kg', prix_vente: 1000, cout_achat: 700, stock_initial: 50 })]);
  session = await valeur(gerant, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('assistant', () => {
  test('module en Bêta, proposé partout, jamais activé d’office', async () => {
    const m = (await db.query("select statut, nature from modules where id = 'assistant'")).rows[0];
    expect(m).toEqual({ statut: 'beta', nature: 'transversal' });
    const { rows } = await db.query("select count(*)::int n, bool_or(par_defaut) d from solution_modules where module_id = 'assistant'");
    expect(rows[0].n).toBe((await db.query('select count(*)::int n from solutions')).rows[0].n);
    expect(rows[0].d).toBe(false);
    expect((await db.query("select count(*)::int n from etablissement_modules where module_id = 'assistant'")).rows[0].n).toBe(0);
  });

  test('sans le module : refusé', async () => {
    await expect(alertes()).rejects.toThrow(/Accès refusé/);
  });

  test('module actif : rien d’inventé, puis annulations répétées et remises fortes', async () => {
    await comme(sa, "select accorder_module($1, 'assistant', true)", [etab]);
    await comme(sa, "select definir_module_etablissement($1, 'assistant', true)", [etab]);
    const avant = await alertes();
    expect(avant.find((a) => a.domaine === 'assistant')).toBeUndefined();
    for (let i = 0; i < 3; i += 1) {
      const v = await vendre();
      await comme(gerant, "select annuler_vente($1, 'Erreur de saisie')", [v.vente_id]);
    }
    await vendre(400);
    const apres = await alertes();
    const annul = apres.find((a) => a.cle.startsWith('annulations_'));
    expect(annul).toMatchObject({ niveau: 'alerte', nombre: 3, route: 'ventes?statut=annulee', domaine: 'assistant' });
    expect(apres.find((a) => a.cle === 'remises_fortes')).toMatchObject({ nombre: 1 });
    // Les alertes des tableaux de bord sont reprises avec leur domaine ; les urgentes d'abord.
    expect(apres.every((a) => a.domaine && a.titre)).toBe(true);
    const rangs = apres.map((a) => ({ critique: 0, alerte: 1, info: 2 })[a.niveau]);
    expect([...rangs].sort()).toEqual(rangs);
  });

  test('les seuils se règlent', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'assistant', $2::jsonb)", [etab, json({ seuil_annulations: 10, seuil_remise: 50 })]);
    const a = await alertes();
    expect(a.find((x) => x.cle.startsWith('annulations_'))).toBeUndefined();
    expect(a.find((x) => x.cle === 'remises_fortes')).toBeUndefined();
    await comme(gerant, "select enregistrer_parametres_module($1, 'assistant', $2::jsonb)", [etab, json({ seuil_annulations: 3, seuil_remise: 30 })]);
  });

  test('isolation : sans le droit, autre établissement, anonyme', async () => {
    await expect(alertes(lecteur)).rejects.toThrow(/Accès refusé/);
    await expect(alertes(autreGerant)).rejects.toThrow(/Accès refusé/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select assistant_alertes($1)', [etab]))).rejects.toThrow(/permission denied/);
    // Le réglage ne fuit pas vers qui n'a pas le droit : valeur par défaut renvoyée.
    expect(Number(await valeur(autreGerant, "select assistant_reglage($1, 'seuil_annulations', 99)", [etab]))).toBe(99);
  });

  test('lecture seule : aucune ligne écrite', async () => {
    const compter = async () => (await db.query('select count(*)::int n from journal_audit')).rows[0].n;
    const n = await compter();
    await alertes();
    expect(await compter()).toBe(n);
  });
});
