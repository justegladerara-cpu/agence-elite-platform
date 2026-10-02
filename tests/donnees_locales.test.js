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

  test('la démo : la gérante voit les 3 Hubs, le caissier du marché un seul', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const gerante = await api.rpc('mon_contexte');
    expect(gerante.etablissements).toHaveLength(1);
    expect(gerante.etablissements[0].hubs.map((h) => h.nom)).toEqual(['Magasin principal', 'Boutique Marché Total', 'Dépôt principal']);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.etablissements[0].hubs.map((h) => h.nom)).toEqual(['Boutique Marché Total']);
    expect(contexte.utilisateur.nom).toContain('Junior');
  });

  test('Patrondemo et Userdemo doivent changer leur mot de passe temporaire', async () => {
    utilisateur = comptes['patrondemo@identifiants.agence-elite.fr'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.compte).toMatchObject({ identifiant: 'Patrondemo', doit_changer_mot_de_passe: true });
    expect(contexte.etablissements).toEqual([]);
  });

  test('le parcours de vente fonctionne avec les nombres typés, dans le Hub de la caisse', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await api.rpc('mon_contexte')).etablissements[0];
    const hubMp = etab.hubs.find((h) => h.nom === 'Magasin principal').id;
    const [session] = await api.lire('sessions_caisse', { eq: { etablissement_id: etab.id, statut: 'ouverte' } });
    expect(session.hub_id).toBe(hubMp);
    const [savon] = await api.lire('articles', { eq: { etablissement_id: etab.id, reference: 'SAV-40' } });
    const [avant] = await api.lire('stock_hubs', { eq: { hub_id: hubMp, article_id: savon.id } });
    expect(typeof avant.quantite).toBe('number');
    const vente = await api.rpc('enregistrer_vente', {
      p_etablissement_id: etab.id, p_session_id: session.id,
      p_lignes: [{ article_id: savon.id, quantite: 2 }], p_paiements: [{ mode: 'especes', montant: 2000 }],
    });
    expect(vente.monnaie).toBe(1000);
    const [apres] = await api.lire('stock_hubs', { eq: { hub_id: hubMp, article_id: savon.id } });
    expect(apres.quantite).toBe(avant.quantite - 2);
    const recu = await api.rpc('recu_vente', { p_vente_id: vente.vente_id });
    expect(recu.hub.nom).toBe('Magasin principal');
    expect(recu.lignes[0].libelle).toBe('Savon de ménage 400 g');
  });

  test('le tableau de bord de la démo est cohérent, consolidé et par Hub', async () => {
    utilisateur = comptes['patrondemo@identifiants.agence-elite.fr'];
    expect((await api.rpc('mon_contexte')).etablissements).toEqual([]);
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await api.rpc('mon_contexte')).etablissements[0];
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const tdb = await api.rpc('tableau_de_bord_hub', { p_etablissement_id: etab.id, p_hub_id: null, p_du: '2000-01-01', p_au: aujourdHui });
    expect(tdb.nombre_ventes).toBe(8);
    expect(tdb.creances).toBe(8000);
    const parHub = Object.fromEntries(tdb.par_hub.map((h) => [h.nom, h.nombre_ventes]));
    expect(parHub).toEqual({ 'Magasin principal': 5, 'Boutique Marché Total': 3, 'Dépôt principal': 0 });
    const marche = await api.rpc('tableau_de_bord_hub', {
      p_etablissement_id: etab.id, p_hub_id: etab.hubs.find((h) => h.nom === 'Boutique Marché Total').id, p_du: '2000-01-01', p_au: aujourdHui,
    });
    expect(marche.chiffre_affaires).toBe(37700);
    expect(tdb.transferts).toBe(2);
  });
});
