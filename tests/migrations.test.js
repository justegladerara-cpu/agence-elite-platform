import { describe, expect, test } from 'vitest';
import { readdir } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';

const tablesAttendues = ['articles','categories_articles','categories_modules','client_identite','client_membres','clients','clotures','comptes_connexion','contacts','depenses','etablissement_identite','etablissement_membres','etablissement_modules','etablissement_parametres','etablissements','evenements','hubs','inventaires','invitations','journal_audit','licence_evenements','licences','lignes_inventaire','lignes_transfert','lignes_vente','membre_hubs','module_dependances','modules','mouvements_stock','numerotations','offres','paiements','permissions','plateforme_admins','plateforme_identite','points_de_vente','profils','role_permissions','roles','sessions_caisse','sessions_support','solution_modules','solutions','tentatives_connexion','transferts','ventes'];

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
  test('les 46 tables attendues existent', async () => {
    const db = await creerBase();
    const { rows } = await db.query("select tablename from pg_tables where schemaname='public' order by tablename");
    expect(rows.map((r) => r.tablename)).toEqual(tablesAttendues);
    await db.close();
  });
});
