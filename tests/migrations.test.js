import { describe, expect, test } from 'vitest';
import { readdir } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';

const tablesAttendues = ['articles','categories_articles','client_membres','clients','clotures','contacts','depenses','etablissement_identite','etablissement_membres','etablissement_modules','etablissement_parametres','etablissements','evenements','invitations','journal_audit','licence_evenements','licences','lignes_vente','module_dependances','modules','mouvements_stock','numerotations','offres','paiements','permissions','plateforme_admins','points_de_vente','profils','role_permissions','roles','sessions_caisse','sessions_support','solution_modules','solutions','ventes'];

describe('migrations', () => {
  test('leurs noms sont valides et uniques', async () => {
    const noms = (await readdir('supabase/migrations')).filter((n) => n.endsWith('.sql'));
    expect(noms.every((n) => /^\d{14}_[a-z0-9_]+\.sql$/.test(n))).toBe(true);
    expect(new Set(noms).size).toBe(noms.length);
  });
  test('deux bases neuves se construisent', async () => {
    const [a, b] = await Promise.all([creerBase(), creerBase()]);
    await a.close(); await b.close();
  });
  test('les 35 tables attendues existent', async () => {
    const db = await creerBase();
    const { rows } = await db.query("select tablename from pg_tables where schemaname='public' order by tablename");
    expect(rows.map((r) => r.tablename)).toEqual(tablesAttendues);
    await db.close();
  });
});
