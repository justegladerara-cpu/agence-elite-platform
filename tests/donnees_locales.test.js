import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { baseVide, listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { chargerMigrations, creerBaseLocale } from './helpers/locale.js';
import { construireAppel, construireLecture, creerApiLocale, preparerBase } from '../src/noyau/donnees/moteurLocal.js';

let db;
let utilisateur = null;
let api;
let comptes;

beforeAll(async () => {
  db = await creerBaseLocale();
  expect(await baseVide(db)).toBe(true);
  await semerDemo(db);
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
});

afterAll(async () => db.close());

describe('moteur de données local', () => {
  test('les migrations ne sont appliquées qu\'une fois', async () => {
    await preparerBase(db, { shim: '', migrations: await chargerMigrations() });
    const n = (await db.query('select count(*)::int n from _local.migrations')).rows[0].n;
    expect(n).toBe((await chargerMigrations()).length);
  });

  test('les identifiants SQL sont validés', () => {
    expect(() => construireAppel('drop table x', {})).toThrow(/refusé/);
    expect(() => construireLecture('ventes; delete', {})).toThrow(/refusé/);
    expect(() => construireLecture('ventes', { eq: { 'id or 1=1': 1 } })).toThrow(/refusé/);
    expect(construireAppel('f', { p_a: 1, p_b: { x: 1 } }).sql).toBe('select public.f(p_a => $1, p_b => $2::jsonb) as resultat');
    const tableau = construireAppel('f', { p_m: ['a', 'b"c'], p_l: [] }, { p_m: 'text[]', p_l: 'jsonb' });
    expect(tableau.sql).toBe('select public.f(p_m => $1::text[], p_l => $2::jsonb) as resultat');
    expect(tableau.parametres).toEqual(['{"a","b\\"c"}', '[]']);
  });

  test('sans connexion, rien n\'est lisible', async () => {
    utilisateur = null;
    expect(await api.lire('articles')).toEqual([]);
    await expect(api.rpc('mon_contexte')).rejects.toThrow(/permission denied/);
  });

  test('la démo donne au gérant deux établissements et au caissier un seul', async () => {
    utilisateur = comptes['gerant@demo.local'];
    expect((await api.rpc('mon_contexte')).etablissements).toHaveLength(2);
    utilisateur = comptes['caisse@demo.local'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.etablissements).toHaveLength(1);
    expect(contexte.utilisateur.nom).toContain('Junior');
  });

  test('le parcours de vente fonctionne avec les nombres typés', async () => {
    utilisateur = comptes['caisse@demo.local'];
    const etab = (await api.rpc('mon_contexte')).etablissements[0].id;
    const [session] = await api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } });
    const [gants] = await api.lire('stock_articles', { eq: { etablissement_id: etab, nom: 'Gants de protection' } });
    expect(typeof gants.quantite).toBe('number');
    const vente = await api.rpc('enregistrer_vente', {
      p_etablissement_id: etab, p_session_id: session.id,
      p_lignes: [{ article_id: gants.article_id, quantite: 2 }], p_paiements: [{ mode: 'especes', montant: 10000 }],
    });
    expect(vente.monnaie).toBe(3000);
    const [apres] = await api.lire('stock_articles', { eq: { article_id: gants.article_id } });
    expect(apres.quantite).toBe(gants.quantite - 2);
    const recu = await api.rpc('recu_vente', { p_vente_id: vente.vente_id });
    expect(recu.lignes[0].libelle).toBe('Gants de protection');
    const ventes = await api.lire('ventes', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 50 });
    expect(ventes.length).toBe(5);
    expect(typeof ventes[0].total).toBe('number');
  });

  test('le tableau de bord de la démo est cohérent', async () => {
    utilisateur = comptes['gerant@demo.local'];
    const etab = (await api.rpc('mon_contexte')).etablissements.find((e) => e.nom.includes('Pointe-Noire')).id;
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const tdb = await api.rpc('tableau_de_bord_commerce', { p_etablissement_id: etab, p_du: '2000-01-01', p_au: aujourdHui });
    expect(tdb.nombre_ventes).toBe(5);
    expect(tdb.creances).toBe(35000);
    expect(tdb.stock_bas.map((s) => s.nom)).toContain('Huile moteur 5 L');
  });
});
