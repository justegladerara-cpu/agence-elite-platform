import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { construireAnalyse } from '../src/modules/tableau_de_bord/analyses.js';
import { creerBaseLocale } from './helpers/locale.js';

// Analyses du Tableau de bord et rapport A4 (analyse_commerce) : mêmes chiffres que le tableau Commerce,
// droits, Hub, caissière limitée à son rapport, isolation.
let db;
let api;
let utilisateur = null;
let comptes;
let etabs;
const auj = new Date().toISOString().slice(0, 10);
const il_y_a = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const comme = (email) => { utilisateur = comptes[email]; };
const analyse = (etab, du = il_y_a(29), au = auj, filtres = {}) =>
  api.rpc('analyse_commerce', { p_etablissement_id: etabs[etab], p_du: du, p_au: au, p_filtres: filtres });
const cockpit = (etab, du = il_y_a(29), au = auj, filtres = {}) =>
  api.rpc('cockpit_commerce', { p_etablissement_id: etabs[etab], p_du: du, p_au: au, p_filtres: filtres });
const kpi = (r, cle) => r.kpis.find((k) => k.cle === cle)?.valeur;

beforeAll(async () => {
  db = await creerBaseLocale();
  await semerDemo(db);
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
  etabs = Object.fromEntries((await db.query('select nom, id from public.etablissements')).rows.map((r) => [r.nom, r.id]));
}, 120000);

afterAll(async () => db.close());

describe('analyse_commerce', () => {
  test('les totaux sont ceux du tableau Commerce, chaque jour est présent', async () => {
    comme('gerante@demo.agence-elite.fr');
    const a = await analyse('Commerce Démo');
    const c = await cockpit('Commerce Démo');
    expect(Number(a.totaux.chiffre)).toBe(Number(kpi(c, 'chiffre_affaires')));
    expect(Number(a.totaux.tickets)).toBe(Number(kpi(c, 'tickets')));
    expect(a.par_jour).toHaveLength(30);
    expect(a.par_jour.reduce((s, j) => s + Number(j.chiffre), 0)).toBe(Number(a.totaux.chiffre));
    expect(a.par_heure.reduce((s, h) => s + Number(h.tickets), 0)).toBe(Number(a.totaux.tickets));
    expect(a.grille.reduce((s, h) => s + Number(h.tickets), 0)).toBe(Number(a.totaux.tickets));
    expect(a.articles.length).toBeGreaterThan(0);
    expect(a.articles.reduce((s, x) => s + Number(x.chiffre), 0)).toBeCloseTo(Number(a.totaux.chiffre_lignes), 2);
    expect(a.portee.tous).toBe(true);
    expect(a.totaux.depenses).not.toBeNull();
    expect(Array.isArray(a.equipe)).toBe(true);
    expect(a.equipe.length).toBeGreaterThan(0);
  });

  test('construireAnalyse produit un résumé, des points d’attention et des chiffres comparés', async () => {
    comme('gerante@demo.agence-elite.fr');
    const a = construireAnalyse(await analyse('Commerce Démo'));
    expect(a.kpis.map((k) => k.cle)).toEqual(['chiffre', 'tickets', 'panier', 'marge', 'remises', 'annulations']);
    expect(typeof a.resume).toBe('string');
    expect(a.resume.length).toBeGreaterThan(10);
    expect(a.attention.length).toBeLessThanOrEqual(3);
    expect(a.meilleureHeure).not.toBeNull();
    expect(a.top.length).toBeLessThanOrEqual(10);
  });

  test('une caissière ne voit que ses propres ventes', async () => {
    comme('caisse-marche@demo.agence-elite.fr');
    const a = await analyse('Commerce Démo');
    expect(a.portee.tous).toBe(false);
    expect(a.equipe.every((p) => p.id === comptes['caisse-marche@demo.agence-elite.fr'])).toBe(true);
    expect(a.totaux.depenses).toBeNull();
    expect(a.credits).toBeNull();
  });

  test('Hub demandé : un caissier ne peut pas lire un autre Hub', async () => {
    comme('gerante@demo.agence-elite.fr');
    const hubs = Object.fromEntries((await api.lire('hubs', { eq: { etablissement_id: etabs['Commerce Démo'] } })).map((h) => [h.nom, h.id]));
    const marche = await analyse('Commerce Démo', il_y_a(29), auj, { hub_id: hubs['Boutique Marché Total'] });
    const tout = await analyse('Commerce Démo');
    expect(Number(tout.totaux.chiffre)).toBeGreaterThanOrEqual(Number(marche.totaux.chiffre));
    comme('caisse-marche@demo.agence-elite.fr');
    await expect(analyse('Commerce Démo', il_y_a(29), auj, { hub_id: hubs['Magasin principal'] })).rejects.toThrow(/Accès refusé à ce Hub/);
  });

  test('aucun accès sans ventes.lire ni à un autre établissement', async () => {
    comme('hotel@demo.agence-elite.fr');
    await expect(analyse('Commerce Démo')).rejects.toThrow(/Permission refusée|Accès refusé/);
  });

  test('un jour seul : comparaison au même jour de la semaine d’avant et historique pour la prévision', async () => {
    comme('gerante@demo.agence-elite.fr');
    const a = await analyse('Commerce Démo', auj, auj);
    expect(a.periode.du_precedent).toBe(il_y_a(7));
    expect(Array.isArray(a.historique_meme_jour)).toBe(true);
  });
});
