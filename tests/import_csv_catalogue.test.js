import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { lireCsvArticles } from '../src/modules/articles/importCsv.js';
import { commeRole, creerBase } from './helpers/db.js';

// Les cas de transcription d'un vrai menu restent une revue humaine du client.
// Les tests automatiques utilisent uniquement un CSV inventé.
import { catalogueFictifCsv } from './helpers/catalogueFictif.js';
const lireCatalogue = async () => lireCsvArticles(catalogueFictifCsv());

describe('catalogue entièrement fictif', () => {
  test('prix distincts, variantes neutres, lignes à confirmer sans prix et caractères CSV', async () => {
    const lignes = await lireCatalogue();
    expect(lignes).toHaveLength(228);
    expect(lignes.filter((l) => l.actif === 'oui')).toHaveLength(218);
    expect(lignes.filter((l) => l.variante)).toHaveLength(20);
    const attente = lignes.filter((l) => l.prix_vente == null);
    expect(attente).toHaveLength(10);
    expect(attente.every((l) => l.actif === 'non' && l.motif_attente)).toBe(true);
    expect(new Set(lignes.map((l) => l.reference)).size).toBe(228);
    expect(new Set(lignes.filter((l) => l.actif === 'oui').map((l) => l.categorie)).size).toBe(29);
    expect(lignes.filter((l) => l.nom === 'Article fictif variante 1').map((l) => l.prix_vente)).toEqual([700, 725]);
    expect(lignes.filter((l) => l.nom === 'Article fictif variante 10').map((l) => l.prix_vente)).toEqual([1150, 1175]);
    expect(lignes[20]).toMatchObject({ nom: 'Article fictif, « épicé »; grand "format"', prix_vente: 1200, reference: 'FICTIF-021' });
    for (let i = 219; i <= 228; i += 1) {
      expect(lignes.find((l) => l.reference === `FICTIF-${i}`)).toMatchObject({ actif: 'non', motif_attente: 'Prix fictif à confirmer' });
      expect(lignes.find((l) => l.reference === `FICTIF-${i}`).prix_vente).toBeUndefined();
    }
    expect(lignes.filter((l) => l.variante).map((l) => l.variante).every((v) => ['Tarif 1', 'Tarif 2'].includes(v))).toBe(true);
    expect(lignes.every((l) => l.suivi_stock === 'non' && l.stock_initial === undefined)).toBe(true);
    expect(lignes.every((l) => ['bar', 'cuisine'].includes(l.poste_preparation))).toBe(true);
  });
});

describe('import du CSV fictif dans un établissement de test', () => {
  let db;
  let gerant;
  let etab;
  let autre;
  const valeur = async (sql, params) => commeRole(db, 'authenticated', gerant, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);

  beforeAll(async () => {
    db = await creerBase();
    const ins = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
    const sa = await ins('sa@exemple.test');
    gerant = await ins('gerant@exemple.test');
    await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
    const viaSa = (sql, params) => commeRole(db, 'authenticated', sa, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);
    const client = await viaSa("select creer_client('Client Test Catalogue')");
    etab = await viaSa("select creer_etablissement($1, 'restaurant', 'Restaurant Test Catalogue')", [client]);
    autre = await viaSa("select creer_etablissement($1, 'restaurant', 'Autre Restaurant Test')", [client]);
    await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values($1, $2, 'gerant')", [etab, gerant]);
  });
  afterAll(async () => db.close());

  test('dry-run, import, répétition idempotente ; aucun stock, aucun autre établissement touché', async () => {
    const lignes = JSON.stringify(await lireCatalogue());
    const apercu = await valeur('select importer_catalogue($1, $2::jsonb, true)', [etab, lignes]);
    expect(apercu).toMatchObject({ simulation: true, lignes: 228, crees: 218, attente: 10, variantes: 20, categories_creees: 29, reutilises: 0 });
    expect(apercu.avertissements).toEqual([]);
    expect((await db.query('select count(*)::int n from articles where etablissement_id = $1', [etab])).rows[0].n).toBe(0);
    const reel = await valeur('select importer_catalogue($1, $2::jsonb, false)', [etab, lignes]);
    expect(reel).toMatchObject({ crees: 218, attente: 10, categories_creees: 29 });
    expect(await valeur('select importer_catalogue($1, $2::jsonb, false)', [etab, lignes]))
      .toMatchObject({ crees: 0, modifies: 0, reutilises: 0, inchanges: 218, categories_creees: 0, categories_reutilisees: 29 });
    const n = async (sql) => (await db.query(sql, [etab])).rows[0].n;
    expect(await n('select count(*)::int n from articles where etablissement_id = $1 and actif')).toBe(218);
    expect(await n('select count(*)::int n from categories_articles where etablissement_id = $1')).toBe(29);
    expect(await n('select count(*)::int n from articles where etablissement_id = $1 and suivi_stock')).toBe(0);
    expect(await n('select count(*)::int n from mouvements_stock where etablissement_id = $1')).toBe(0);
    expect(await n("select count(*)::int n from articles where etablissement_id = $1 and poste_preparation = 'bar'")).toBe(114);
    expect((await db.query('select count(*)::int n from articles where etablissement_id = $1', [autre])).rows[0].n).toBe(0);
    const premieres = (await db.query('select nom from categories_articles where etablissement_id = $1 order by ordre limit 3', [etab])).rows.map((c) => c.nom);
    expect(premieres).toEqual(['Catégorie fictive 01', 'Catégorie fictive 02', 'Catégorie fictive 03']);
  });
});
