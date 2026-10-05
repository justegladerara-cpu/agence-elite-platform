import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { lireCsvArticles } from '../src/modules/articles/importCsv.js';
import { commeRole, creerBase } from './helpers/db.js';

// Catalogue The Dream relu sur les 6 photos du menu (2026-10-05). Ces nombres sont la référence du rapport.
const lireCatalogue = async () => lireCsvArticles(await readFile(new URL('../donnees/imports/the-dream/catalogue.csv', import.meta.url), 'utf8'));

// Produits barrés au marqueur sur le menu : jamais dans le fichier, sous aucune forme.
const EXCLUS = [
  'Ngoumba', 'Ngoki', 'Gazelle', 'Pangolin', 'Sibissi', 'Planche Duo', 'Gazelle à la sauce arachide', 'Ngumba',
  'Mwambé gazelle', 'Mwambé Ngumba', 'Bouillon de ngoumba', 'Poulpe', 'Seiche', 'Huîtres', 'Escalope',
  'Saucisse niçoise sauce blanche', 'Omelette nature', 'Mini burger', 'Spaghetti simple', 'Spaghetti délice',
  'Spaghetti sauce rouge Niger', 'Maboké de ngulu',
];

describe('catalogue The Dream retranscrit', () => {
  test('prix lus sur les photos, variantes neutres, lignes à confirmer sans prix', async () => {
    const lignes = await lireCatalogue();
    expect(lignes).toHaveLength(228);
    expect(lignes.filter((l) => l.actif === 'oui')).toHaveLength(218);
    expect(lignes.filter((l) => l.variante)).toHaveLength(20);
    const attente = lignes.filter((l) => l.prix_vente == null);
    expect(attente).toHaveLength(10);
    expect(attente.every((l) => l.actif === 'non' && l.motif_attente)).toBe(true);
    expect(new Set(lignes.map((l) => l.reference)).size).toBe(228);
    expect(new Set(lignes.filter((l) => l.actif === 'oui').map((l) => l.categorie)).size).toBe(29);
    const prix = (nom) => lignes.filter((l) => l.nom === nom).map((l) => l.prix_vente);
    expect(prix('Château Petit Bois')).toEqual([15000]);
    expect(prix('Mojito')).toEqual([6500]);
    expect(prix('Mojito (sans alcool)')).toEqual([5000]);
    expect(prix('Château Rodet')).toEqual([3500, 15000]);
    expect(prix('Absolu Vodka')).toEqual([30000]);
    expect(prix('Hendrick’s Gin')).toEqual([60000]);
    expect(prix('Côte sautée façon Dream Resto')).toEqual([3000]);
    expect(prix('Brochette Royal Mix')).toEqual([4000]);
    expect(prix('Dream délice')).toEqual([3000]);
    for (const nom of ['J&B Rare', 'Camino Real Tequila Blanco', 'Frites de pomme de terre', 'Sodabi', 'Mwambé mokalu', 'Chikwangue (mayaka)']) {
      expect(lignes.find((l) => l.nom === nom)).toMatchObject({ actif: 'non' });
      expect(lignes.find((l) => l.nom === nom).prix_vente).toBeUndefined();
    }
    expect(lignes.filter((l) => l.variante).map((l) => l.variante).every((v) => ['Tarif 1', 'Tarif 2', 'Sur la terrasse', 'Dans le VIP'].includes(v))).toBe(true);
    expect(lignes.every((l) => l.suivi_stock === 'non' && l.stock_initial === undefined)).toBe(true);
    expect(lignes.every((l) => ['bar', 'cuisine'].includes(l.poste_preparation))).toBe(true);
    for (const exclu of EXCLUS) expect(lignes.some((l) => l.nom.toLowerCase() === exclu.toLowerCase())).toBe(false);
  });
});

describe('import réel du fichier dans un établissement de test', () => {
  let db;
  let gerant;
  let etab;
  let autre;
  const valeur = async (sql, params) => commeRole(db, 'authenticated', gerant, async (tx) => Object.values((await tx.query(sql, params)).rows[0])[0]);

  beforeAll(async () => {
    db = await creerBase();
    const ins = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
    const sa = await ins('sa@dream.test');
    gerant = await ins('gerant@dream.test');
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
    expect(premieres).toEqual(['Softs, jus & énergisants', 'Bières', 'Cocktails sans alcool']);
  });
});
