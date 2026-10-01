import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '../..');

export async function creerBase() {
  const db = new PGlite();
  await db.exec(await readFile(resolve(racine, 'tests/sql/supabase_shim.sql'), 'utf8'));
  const fichiers = (await readdir(resolve(racine, 'supabase/migrations')))
    .filter((nom) => nom.endsWith('.sql')).sort();
  for (const fichier of fichiers) {
    await db.exec(await readFile(resolve(racine, 'supabase/migrations', fichier), 'utf8'));
  }
  return db;
}

export async function commeRole(db, role, userId, fn) {
  return db.transaction(async (tx) => {
    if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error('Rôle de test invalide');
    await tx.exec(`set local role ${role}`);
    const claims = JSON.stringify({ sub: userId, role });
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    return fn(tx);
  });
}
