import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';
let db;
let modele;
beforeAll(async () => {
  db = await creerBase();
  modele = await readFile(new URL('../docs/SOP/templates/TEMPLATE_MIGRATION.sql', import.meta.url), 'utf8');
});
afterAll(async () => { await db?.close(); });

test('le modèle de migration compile et se rejoue après toutes les migrations', async () => {
  await db.exec(modele);
  await db.exec(modele);
  const { rows } = await db.query("select relrowsecurity from pg_class where oid='public.exemple'::regclass");
  expect(rows[0].relrowsecurity).toBe(true);
});

test('le modèle prévoit les lectures contrôlées, index et conventions métier', async () => {
  const { rows } = await db.query(`select
    has_table_privilege('authenticated','public.exemple','SELECT') lecture,
    has_table_privilege('authenticated','public.exemple','INSERT,UPDATE,DELETE') ecriture,
    (select array_agg(p.proname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='public.exemple'::regclass and not t.tgisinternal) declencheurs,
    (select count(*)::int from pg_index where indrelid='public.exemple'::regclass) index`);
  expect(rows[0].lecture).toBe(true);
  expect(rows[0].ecriture).toBe(false);
  expect(rows[0].declencheurs).toEqual(expect.arrayContaining(['refuser_suppression', 'verrouiller_etablissement_id', 'journaliser_modification']));
  expect(rows[0].index).toBe(3); // PK et les deux références établissement/Hub.
});
