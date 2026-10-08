// Catalogue après migrations : PGlite par défaut, PostgreSQL réel local en CI.
// Le contrôle PostgreSQL est strictement en lecture seule et limité au loopback.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { creerBase } from './db.js';
const lancer = promisify(execFile);

export function verifierUrlLocale(adresse) {
  let url;
  try { url = new URL(adresse); } catch {
    throw new Error('Adresse PostgreSQL locale invalide.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.port !== '54322' || url.pathname !== '/postgres'
    || url.search || url.hash) {
    throw new Error('Le catalogue CI doit utiliser uniquement le PostgreSQL Supabase local, port54322, base postgres.');
  }
  return adresse;
}

export async function creerBaseCatalogue() {
  const adresse = process.env.AUDIT_BASE_LOCALE_URL;
  if (!adresse) return creerBase();
  verifierUrlLocale(adresse);
  return {
    async query(sql, parametres = []) {
      if (parametres.length || !/^\s*(select|with)\b/i.test(sql) || sql.includes(';')) {
        throw new Error('Le lecteur de catalogue CI accepte une seule requête SELECT sans paramètres.');
      }
      const lecture = `begin read only; select coalesce(jsonb_agg(to_jsonb(resultat)), '[]'::jsonb) from (${sql}) resultat; rollback;`;
      try {
        const { stdout } = await lancer('psql', [adresse, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', lecture], { maxBuffer: 8 * 1024 * 1024 });
        return { rows: JSON.parse(stdout.trim()) };
      } catch {
        // Ne jamais propager un objet d'erreur contenant les arguments de connexion.
        throw new Error('Lecture du catalogue PostgreSQL local impossible ; vérifier la reconstruction et psql.');
      }
    },
    async close() {},
  };
}
