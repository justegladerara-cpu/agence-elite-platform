import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';
let db;
beforeAll(async () => { db = await creerBase(); }); afterAll(async () => db.close());

describe('catalogue de départ', () => {
  test('contient les solutions, modules et dépendances attendus', async () => {
    expect((await db.query('select id,statut from solutions order by id')).rows).toEqual([
      { id: 'commerce', statut: 'en_preparation' }, { id: 'hotel', statut: 'future' }, { id: 'restaurant', statut: 'future' }
    ]);
    expect((await db.query('select count(*)::int n from modules')).rows[0].n).toBe(3);
    expect((await db.query('select count(*)::int n from module_dependances')).rows[0].n).toBe(2);
    expect((await db.query('select count(*)::int n from solution_modules where par_defaut')).rows[0].n).toBe(9);
    expect((await db.query("select count(*)::int n from modules where nature='metier'")).rows[0].n).toBe(0);
  });
  test('contient les rôles, permissions et leurs 13 droits exacts', async () => {
    expect((await db.query('select id from roles order by ordre')).rows.map((r) => r.id)).toEqual(['gerant','responsable','employe','comptable','lecteur']);
    expect((await db.query('select count(*)::int n from permissions')).rows[0].n).toBe(5);
    expect((await db.query('select count(*)::int n from role_permissions')).rows[0].n).toBe(13);
  });
  test('la migration est idempotente', async () => {
    await db.exec(await readFile('supabase/migrations/20261001000005_donnees_catalogue.sql', 'utf8'));
    expect((await db.query('select count(*)::int n from solutions')).rows[0].n).toBe(3);
  });
});
