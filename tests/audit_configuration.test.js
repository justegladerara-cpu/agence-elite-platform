import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let admin;

beforeAll(async () => {
  db = await creerBase();
  admin = (await db.query("insert into auth.users(email) values ('audit-config@exemple.test') returning id")).rows[0].id;
  await db.query("insert into plateforme_admins(user_id, role) values ($1, 'super_admin')", [admin]);
});

afterAll(async () => db.close());

describe('audit des configurations sensibles', () => {
  test('droits, dépendances, identité et profil sont journalisés sans copier les fichiers', async () => {
    await commeRole(db, 'authenticated', admin, async (tx) => {
      await tx.query("select enregistrer_identite_plateforme('{\"sous_titre\": \"Gestion professionnelle auditée\"}'::jsonb)");
      await tx.query("select enregistrer_mon_profil('{\"nom_affiche\": \"Administrateur audit\"}'::jsonb)");
    });
    await db.query("insert into module_dependances(module_id, depend_de) values ('rapports', 'paiements')");
    const tables = (await db.query(
      "select distinct table_nom from journal_audit where table_nom in ('plateforme_identite', 'profils', 'module_dependances') order by table_nom",
    )).rows.map((ligne) => ligne.table_nom);
    expect(tables).toEqual(['module_dependances', 'plateforme_identite', 'profils']);
    expect((await db.query("select count(*)::int n from pg_trigger where tgrelid = 'public.fichiers'::regclass and tgname like '%audit%'")).rows[0].n).toBe(0);
  });
});
