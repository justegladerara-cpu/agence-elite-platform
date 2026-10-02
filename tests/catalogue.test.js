import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';
let db;
beforeAll(async () => { db = await creerBase(); }); afterAll(async () => db.close());

describe('catalogue de départ', () => {
  test('contient les solutions, modules et dépendances attendus', async () => {
    expect((await db.query('select id,statut from solutions order by id')).rows).toEqual([
      { id: 'commerce', statut: 'active' }, { id: 'ecommerce', statut: 'future' }, { id: 'hotel', statut: 'future' },
      { id: 'restaurant', statut: 'future' }, { id: 'rh', statut: 'future' }, { id: 'services', statut: 'future' }
    ]);
    // 12 modules disponibles + 13 modules « Prévu » (catalogue, sans écran ni permission).
    expect((await db.query('select count(*)::int n from modules')).rows[0].n).toBe(25);
    expect((await db.query("select count(*)::int n from modules where statut = 'actif'")).rows[0].n).toBe(12);
    expect((await db.query("select count(*)::int n from modules where statut = 'futur' and exists (select 1 from permissions p where p.module_id = modules.id)")).rows[0].n).toBe(0);
    expect((await db.query('select count(*)::int n from module_dependances')).rows[0].n).toBe(36);
    expect((await db.query('select count(*)::int n from solution_modules where par_defaut')).rows[0].n).toBe(27);
    // Aucune offre ne contient un module prévu (il reste visible comme « Prévu », jamais vendu).
    expect((await db.query("select count(*)::int n from offres o join modules m on m.id = any (o.modules) where m.statut not in ('actif', 'beta')")).rows[0].n).toBe(0);
  });
  test('contient les rôles, permissions et leurs droits exacts (socle et Commerce)', async () => {
    expect((await db.query('select id from roles order by ordre')).rows.map((r) => r.id)).toEqual(['gerant','responsable','responsable_hub','gestionnaire_depot','employe','comptable','lecteur']);
    expect((await db.query('select count(*)::int n from permissions')).rows[0].n).toBe(23);
    expect((await db.query('select count(*)::int n from role_permissions')).rows[0].n).toBe(101);
  });
  test('la migration est idempotente', async () => {
    await db.exec(await readFile('supabase/migrations/20261001000005_donnees_catalogue.sql', 'utf8'));
    expect((await db.query('select count(*)::int n from solutions')).rows[0].n).toBe(6);
  });
});
