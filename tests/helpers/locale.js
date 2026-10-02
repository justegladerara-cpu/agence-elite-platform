import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { optionsPGlite, preparerBase } from '../../src/noyau/donnees/moteurLocal.js';

const racine = resolve(import.meta.dirname, '../..');

export async function chargerMigrations() {
  const dossier = resolve(racine, 'supabase/migrations');
  const noms = (await readdir(dossier)).filter((nom) => nom.endsWith('.sql'));
  return Promise.all(noms.map(async (nom) => ({ nom, sql: await readFile(resolve(dossier, nom), 'utf8') })));
}

export async function creerBaseLocale() {
  const db = new PGlite(optionsPGlite);
  await preparerBase(db, { shim: await readFile(resolve(racine, 'tests/sql/supabase_shim.sql'), 'utf8'), migrations: await chargerMigrations() });
  return db;
}
