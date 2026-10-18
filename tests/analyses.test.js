import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';
import { creerBaseLocale } from './helpers/locale.js';

// Analyses du tableau de bord (analyse_ventes) : chiffres cohérents avec les rapports, droits, Hub, isolation.
let db;
let api;
let utilisateur = null;
let comptes;
let etabs;
const auj = new Date().toISOString().slice(0, 10);
const il_y_a = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const comme = (email) => { utilisateur = comptes[email]; };
const analyse = (etab, du = il_y_a(29), au = auj, hub = null) =>
  api.rpc('analyse_ventes', { p_etablissement_id: etabs[etab], p_du: du, p_au: au, p_hub_id: hub });

beforeAll(async () => {
  db = await creerBaseLocale();
  await semerDemo(db);
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
  etabs = Object.fromEntries((await db.query('select nom, id from public.etablissements')).rows.map((r) => [r.nom, r.id]));
}, 120000);

afterAll(async () => db.close());

describe('analyse des ventes', () => {
  test('les totaux sont ceux des rapports et chaque jour de la période est présent', async () => {
    comme('gerante@demo.agence-elite.fr');
    const a = await analyse('Commerce Démo');
    const r = await api.rpc('rapport_ventes', { p_etablissement_id: etabs['Commerce Démo'], p_du: il_y_a(29), p_au: auj, p_axe: 'jour', p_hub_id: null });
    expect(Number(a.totaux.chiffre)).toBe(Number(r.totaux.chiffre));
    expect(Number(a.totaux.nombre)).toBe(Number(r.totaux.nombre));
    expect(Number(a.totaux.chiffre_precedent)).toBe(Number(r.totaux.chiffre_precedent));
    expect(a.par_jour).toHaveLength(30);
    expect(a.par_jour.reduce((s, j) => s + Number(j.chiffre), 0)).toBe(Number(a.totaux.chiffre));
    expect(a.par_heure.reduce((s, j) => s + Number(j.nombre), 0)).toBe(Number(a.totaux.nombre));
    for (const h of a.par_heure) {
      expect(h.jour_semaine).toBeGreaterThanOrEqual(1);
      expect(h.jour_semaine).toBeLessThanOrEqual(7);
      expect(h.heure).toBeLessThanOrEqual(23);
    }
    expect(a.articles.length).toBeGreaterThan(0);
    expect(a.articles.length).toBeLessThanOrEqual(15);
    expect(Number(a.totaux.encaisse)).toBeGreaterThan(0);
    expect(a.totaux.depenses).not.toBeNull();
    expect(Array.isArray(a.dormants)).toBe(true);
  });

  test('un caissier ne voit que son Hub', async () => {
    comme('gerante@demo.agence-elite.fr');
    const hubs = Object.fromEntries((await api.lire('hubs', { eq: { etablissement_id: etabs['Commerce Démo'] } })).map((h) => [h.nom, h.id]));
    const marche = await analyse('Commerce Démo', il_y_a(29), auj, hubs['Boutique Marché Total']);
    comme('caisse-marche@demo.agence-elite.fr');
    const caissier = await analyse('Commerce Démo');
    expect(Number(caissier.totaux.chiffre)).toBe(Number(marche.totaux.chiffre));
    await expect(analyse('Commerce Démo', il_y_a(29), auj, hubs['Magasin principal'])).rejects.toThrow(/Hub non autorisé|Accès refusé/);
  });

  test('aucun accès à un autre établissement, ni sans connexion', async () => {
    comme('gerante@demo.agence-elite.fr');
    await expect(analyse('Hôtel Démo')).rejects.toThrow(/Permission refusée/);
    utilisateur = null;
    await expect(analyse('Commerce Démo')).rejects.toThrow();
  });

  test('période invalide ou trop longue refusée', async () => {
    comme('gerante@demo.agence-elite.fr');
    await expect(analyse('Commerce Démo', auj, il_y_a(3))).rejects.toThrow(/Période invalide/);
    await expect(analyse('Commerce Démo', il_y_a(500), auj)).rejects.toThrow(/trop longue/);
  });

  test('l’hôtel a aussi ses analyses (ventes de l’hôtel)', async () => {
    comme('hotel@demo.agence-elite.fr');
    const a = await analyse('Hôtel Démo');
    expect(a.par_jour).toHaveLength(30);
  });
});

describe('phrases à retenir', () => {
  const montant = (v) => `${Math.round(Number(v))} F`;
  const base = {
    du: '2026-10-01', au: '2026-10-10', jours: 10, aujourdhui: '2026-10-10',
    totaux: { chiffre: 10000, nombre: 10, panier_moyen: 1000, chiffre_precedent: 8000, nombre_precedent: 10, marge: 1000, chiffre_cout_connu: 10000, encaisse: 9000, depenses: 12000, reste_du: 1000 },
    par_jour: Array.from({ length: 10 }, (_, i) => ({ jour: `2026-10-${String(i + 1).padStart(2, '0')}`, chiffre: 1000, nombre: 1, chiffre_precedent: 800 })),
    par_heure: [{ jour_semaine: 6, heure: 20, chiffre: 7000, nombre: 7 }, { jour_semaine: 1, heure: 9, chiffre: 3000, nombre: 3 }],
    articles: [{ libelle: 'Bière', chiffre: 6000 }],
    dormants: [{ libelle: 'Vin', valeur: 5000 }],
  };

  test('dit l’essentiel en mots simples', async () => {
    const { aRetenir } = await import('../src/modules/tableau_de_bord/analyses.js');
    const textes = aRetenir(base, montant).map((p) => p.texte).join('\n');
    expect(textes).toContain('+25 %');
    expect(textes).toContain('le mois finira vers 31000 F');
    expect(textes).toContain('samedi (70 %');
    expect(textes).toContain('entre 20 h et 22 h');
    expect(textes).toContain('Bière');
    expect(textes).toContain('10 % de marge');
    expect(textes).toContain('il manque 3000 F');
    expect(textes).toContain('pensez à relancer');
    expect(textes).toContain('1 article(s) en stock');
  });

  test('sans vente : une seule phrase, pas de calcul faux', async () => {
    const { aRetenir } = await import('../src/modules/tableau_de_bord/analyses.js');
    const p = aRetenir({ ...base, totaux: { ...base.totaux, chiffre: 0, nombre: 0 } }, montant);
    expect(p).toHaveLength(1);
  });

  test('pas de projection si la période ne couvre pas le mois en cours', async () => {
    const { projectionMois } = await import('../src/modules/tableau_de_bord/analyses.js');
    expect(projectionMois({ ...base, du: '2026-10-05' })).toBeNull();
    expect(projectionMois({ ...base, au: '2026-10-09' })).toBeNull();
  });
});
