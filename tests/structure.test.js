import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
beforeEach(async () => { db = await creerBase(); });
afterEach(async () => { await db.close(); });

describe('structure protégée', () => {
  test('la RLS est active partout et aucune politique ne précède la tâche 002', async () => {
    const { rows } = await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
    expect(rows).toHaveLength(21); expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    expect((await db.query("select * from pg_policies where schemaname='public'")).rows).toHaveLength(0);
  });
  test.each(['anon', 'authenticated'])('%s ne peut ni lire ni créer un client', async (role) => {
    const { rows: utilisateurs } = await db.query("insert into auth.users(email) values('test@example.test') returning id");
    const id = utilisateurs[0].id;
    await db.query("insert into clients(nom) values('Client témoin')");
    await commeRole(db, role, id, async (tx) => {
      expect((await tx.query('select * from clients')).rows).toHaveLength(0);
      await expect(tx.query("insert into clients(nom) values('Interdit')")).rejects.toThrow();
    });
  });
});
