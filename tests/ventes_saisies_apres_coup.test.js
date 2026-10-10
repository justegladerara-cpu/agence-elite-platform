import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Ventes d'un jour passé saisies après coup par le gérant (migration 20261010000125).
let db;
let gerant;
let caissier;
let etab;
let pdv;
let riz;
let savon;
let client;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const jour = async (decalage) => (await db.query('select (date_locale($1) + $2::int)::text j', [etab, decalage])).rows[0].j;
const saisir = (user, j, ventes, motif = 'Coupure internet', especes = null) => valeur(user,
  'select saisir_ventes_passees($1, $2, $3::date, $4::jsonb, $5, $6)', [etab, pdv, j, JSON.stringify(ventes), motif, especes]);
const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).rows[0].q);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@rattrapage.test');
  gerant = await utilisateur('gerant@rattrapage.test');
  caissier = await utilisateur('caissier@rattrapage.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const c = await valeur(admin, "select creer_client('Rattrapage Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Rattrapage')", [c]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissier]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Riz test', prix_vente: 1000, suivi_stock: true, stock_initial: 20 })]);
  savon = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Savon test', prix_vente: 500, suivi_stock: false })]);
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Client test', type: 'client' })]);
  // La caisse du jour est ouverte : la saisie après coup ne doit pas la gêner.
  await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
  pdv = (await db.query('select point_de_vente_id p from sessions_caisse where etablissement_id = $1', [etab])).rows[0].p;
});

afterAll(async () => db.close());

describe('ventes saisies après coup', () => {
  test('le gérant saisit plusieurs ventes d’hier et ferme la caisse de ce jour', async () => {
    if ((await stock(riz)) === 0) await valeur(gerant, "select ajuster_stock($1, $2, 'entree', 20)", [etab, riz]);
    const avant = await stock(riz);
    const hier = await jour(-1);
    const r = await saisir(gerant, hier, [
      { heure: '09:30', lignes: [{ article_id: riz, quantite: 2 }], paiements: [{ mode: 'especes', montant: 2000 }] },
      { heure: '18:15', lignes: [{ article_id: savon, quantite: 3 }], paiements: [{ mode: 'mobile_money', montant: 1500 }] },
      { lignes: [{ article_id: riz, quantite: 1 }], paiements: [], contact_id: client },
    ], 'Coupure internet', 1800);
    expect(r.ventes).toBe(3);
    expect(Number(r.total)).toBe(4500);
    expect(r.cloture.especes_comptees).toBe(1800);
    expect(Number(r.cloture.ecart)).toBe(-200);
    expect(r.cloture.commentaire).toMatch(/Saisie après coup du .* : Coupure internet/);
    expect(await stock(riz)).toBe(avant - 3);
    const ventes = (await db.query(
      "select (cree_le at time zone 'Africa/Brazzaville')::date::text j, to_char(cree_le at time zone 'Africa/Brazzaville', 'HH24:MI') h, note, statut_paiement from ventes where numero = any($1) order by cree_le",
      [r.numeros])).rows;
    expect(ventes.map((v) => [v.j, v.h])).toEqual([[hier, '09:30'], [hier, '12:00'], [hier, '18:15']]);
    expect(ventes.every((v) => v.note === 'Saisie après coup : Coupure internet')).toBe(true);
    expect(ventes[1].statut_paiement).toBe('impayee');
    const paiements = (await db.query(
      "select (p.cree_le at time zone 'Africa/Brazzaville')::date::text j from paiements p join ventes v on v.id = p.vente_id where v.numero = any($1)", [r.numeros])).rows;
    expect(paiements.every((p) => p.j === hier)).toBe(true);
    const session = (await db.query('select statut, rattrapage from sessions_caisse where id = $1', [r.cloture.session_caisse_id])).rows[0];
    expect(session).toEqual({ statut: 'cloturee', rattrapage: true });
    // La caisse du jour reste ouverte et vend normalement, avec la date du jour.
    const today = (await db.query("select id from sessions_caisse where etablissement_id = $1 and statut = 'ouverte'", [etab])).rows;
    expect(today).toHaveLength(1);
    const vente = await valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, today[0].id,
      JSON.stringify([{ article_id: savon, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }])]);
    const date = (await db.query('select (cree_le at time zone $2)::date::text j from ventes where id = $1', [vente.vente_id, 'Africa/Brazzaville'])).rows[0].j;
    expect(date).toBe(await jour(0));
  });

  test('sans espèces comptées : ticket Z « espèces à compter », compté ensuite', async () => {
    const r = await saisir(gerant, await jour(-3), [{ lignes: [{ article_id: savon, quantite: 2 }], paiements: [{ mode: 'especes', montant: 1000 }] }]);
    expect(r.cloture.especes_comptees).toBeNull();
    expect(r.cloture.automatique).toBe(true);
    expect(r.cloture.commentaire).toMatch(/espèces à compter/);
    const compte = await valeur(gerant, 'select compter_cloture($1, 1000)', [r.cloture.id]);
    expect(Number(compte.ecart)).toBe(0);
  });

  test('réservé au gérant, jour passé seulement, motif obligatoire, tout ou rien', async () => {
    const vente = [{ lignes: [{ article_id: savon, quantite: 1 }], paiements: [{ mode: 'especes', montant: 500 }] }];
    await expect(saisir(caissier, await jour(-1), vente)).rejects.toThrow(/Permission refusée/);
    await expect(saisir(gerant, await jour(0), vente)).rejects.toThrow(/jour passé/);
    await expect(saisir(gerant, await jour(-40), vente)).rejects.toThrow(/31 jours/);
    await expect(saisir(gerant, await jour(-1), vente, '  ')).rejects.toThrow(/pourquoi/);
    const avant = (await db.query('select count(*)::int n from ventes')).rows[0].n;
    await expect(saisir(gerant, await jour(-1), [
      ...vente,
      { lignes: [{ article_id: riz, quantite: 1 }], paiements: [] },
    ])).rejects.toThrow(/Vente 2 : Vente à crédit/);
    await expect(saisir(gerant, await jour(-1), [{ heure: '25:00', ...vente[0] }])).rejects.toThrow(/Vente 1 : heure invalide/);
    expect((await db.query('select count(*)::int n from ventes')).rows[0].n).toBe(avant);
  });

  test('la date fixée pour la saisie après coup ne déborde pas sur les écritures suivantes', async () => {
    expect((await db.query('select instant_saisie() = now() as egal')).rows[0].egal).toBe(true);
    expect((await comme(gerant, 'select instant_saisie() = now() as egal'))[0].egal).toBe(true);
  });
});
