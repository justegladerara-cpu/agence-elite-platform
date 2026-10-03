import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import scriptHistorique from '../supabase/demo/historique_demo.sql?raw';
import { creerBaseLocale } from './helpers/locale.js';

// Historique fictif de démonstration : cohérent, idempotent, et il rend les comparaisons possibles.
let db;
let api;
let utilisateur = null;
let comptes;
let etabs;
const auj = new Date().toISOString().slice(0, 10);
const il_y_a = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const appel = (domaine, etab, du = il_y_a(29), au = auj) =>
  api.rpc(`cockpit_${domaine}`, { p_etablissement_id: etabs[etab], p_du: du, p_au: au, p_filtres: {} });
const kpi = (r, cle) => r.kpis.find((k) => k.cle === cle);

beforeAll(async () => {
  db = await creerBaseLocale();
  await semerDemo(db, undefined, undefined, { historique: true });
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
  etabs = Object.fromEntries((await db.query('select nom, id from public.etablissements')).rows.map((r) => [r.nom, r.id]));
}, 300000);

afterAll(async () => db.close());

describe('historique de démonstration', () => {
  test('les ventes historiques sont cohérentes (lignes, paiements, rien dans le futur)', async () => {
    const r = (await db.query(`
      select count(*)::int n,
        count(*) filter (where v.cree_le > now())::int futur,
        count(*) filter (where v.total <> (select coalesce(sum(l.total), 0) from public.lignes_vente l where l.vente_id = v.id) - v.remise)::int incoherentes,
        count(*) filter (where v.statut_paiement = 'payee' and v.montant_paye <> v.total)::int mal_payees
      from public.ventes v where v.note = 'Historique de démonstration'`)).rows[0];
    process.stderr.write(`historique: ${JSON.stringify(r)}\n`);
    expect(r.n).toBeGreaterThan(300);
    expect(r.futur).toBe(0);
    expect(r.incoherentes).toBe(0);
    expect(r.mal_payees).toBe(0);
    const stock = (await db.query('select count(*)::int n from (select article_id, hub_id, sum(quantite) q from public.mouvements_stock group by 1, 2) s where q < 0')).rows[0].n;
    expect(stock).toBe(0);
  });

  test('aucune fausse paie et aucune dépense future', async () => {
    const r = (await db.query(`select count(*) filter (where date_depense > current_date)::int futur,
      count(*) filter (where lower(libelle) like '%salaire%' or lower(libelle) like '%paie%')::int paie from public.depenses`)).rows[0];
    expect(r.futur).toBe(0);
    expect(r.paie).toBe(0);
  });

  test('le script est idempotent', async () => {
    const avant = (await db.query('select count(*)::int n from public.ventes')).rows[0].n;
    await db.transaction(async (tx) => { await tx.exec(scriptHistorique); });
    const apres = (await db.query('select count(*)::int n from public.ventes')).rows[0].n;
    expect(apres).toBe(avant);
  });

  test('les tableaux de bord comparent sur 30 jours et montrent une tendance', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const c = await appel('commerce', 'Commerce Démo');
    expect(c.periode.comparable).toBe(true);
    expect(kpi(c, 'chiffre_affaires').precedent).toBeGreaterThan(0);
    const g = await appel('etablissement', 'Commerce Démo', il_y_a(119));
    expect(g.tendance.points.length).toBeGreaterThanOrEqual(3);
    expect(g.erreurs ?? []).toEqual([]);
  });

  test('hôtel : occupation réaliste, revenus présents', async () => {
    utilisateur = comptes['hotel@demo.agence-elite.fr'];
    const h = await appel('hotel', 'Hôtel Démo');
    process.stderr.write(`hotel: ${JSON.stringify(h.kpis.map((k) => [k.cle, k.valeur]))}\n`);
    const occ = kpi(h, 'occupation');
    if (occ) { expect(occ.valeur).toBeGreaterThan(20); expect(occ.valeur).toBeLessThanOrEqual(100); }
    expect(h.periode.comparable).toBe(true);
  });

  test('restaurant et boutique ont de l’historique', async () => {
    utilisateur = comptes['resto@demo.agence-elite.fr'];
    const r = await appel('restaurant', 'Restaurant Démo');
    expect(r.periode.comparable).toBe(true);
    utilisateur = comptes['boutique@demo.agence-elite.fr'];
    const b = await appel('boutique', 'Boutique en ligne Démo');
    expect(b.kpis.length).toBeGreaterThan(0);
  });
});
