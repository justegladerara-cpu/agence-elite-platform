// Moteur de données local : la vraie base (migrations, RLS, fonctions) tourne dans
// PGlite. Il sert à la démo sans serveur et aux tests ; aucune donnée ne quitte l'appareil.
import { verifierOrdre } from './lecture.js';

const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/;
// Comme Supabase (PostgREST) : une colonne « date » arrive en texte AAAA-MM-JJ, jamais en objet Date.
const COMME_SUPABASE = { parsers: { 1082: (valeur) => valeur } };

function verifierIdentifiant(nom) {
  if (!IDENTIFIANT.test(nom)) throw new Error(`Identifiant refusé : ${nom}`);
  return nom;
}

export function messageErreur(erreur) {
  const brut = erreur?.message ?? String(erreur);
  return brut.replace(/^error:\s*/i, '').split('\n')[0];
}

export async function preparerBase(db, { shim, complement = '', migrations }) {
  await db.exec('create schema if not exists _local; create table if not exists _local.migrations (nom text primary key, appliquee_le timestamptz default now())');
  const dejaInstallee = (await db.query("select 1 from pg_roles where rolname = 'authenticated'")).rows.length > 0;
  if (!dejaInstallee) await db.exec(shim);
  // Complément idempotent (colonnes d'auth, hachage simulé) : aussi pour les bases déjà créées.
  if (complement) await db.exec(complement);
  const appliquees = new Set((await db.query('select nom from _local.migrations')).rows.map((r) => r.nom));
  for (const { nom, sql } of [...migrations].sort((a, b) => a.nom.localeCompare(b.nom))) {
    if (appliquees.has(nom)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into _local.migrations(nom) values ($1)', [nom]);
    });
  }
}

export async function executerComme(db, utilisateurId, fn) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(utilisateurId ? 'set local role authenticated' : 'set local role anon');
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(utilisateurId ? { sub: utilisateurId, role: 'authenticated' } : { role: 'anon' }),
      ]);
      return await fn(tx);
    });
  } catch (erreur) {
    throw new Error(messageErreur(erreur));
  }
}

function valeurParametre(valeur) {
  if (valeur !== null && typeof valeur === 'object' && !(valeur instanceof Date)) return JSON.stringify(valeur);
  return valeur;
}

// Tableau JavaScript -> littéral de tableau Postgres ({"a","b"}).
function litteralTableau(valeurs) {
  return `{${valeurs.map((v) => (v === null ? 'NULL' : `"${String(v).replace(/[\\"]/g, '\\$&')}"`)).join(',')}}`;
}

// types : type SQL de chaque paramètre (ex. { p_modules: 'text[]' }) quand il est connu.
export function construireAppel(nom, args = {}, types = {}) {
  const cles = Object.keys(args).filter((cle) => args[cle] !== undefined).map(verifierIdentifiant);
  const tableauSql = (cle) => /^[a-z ]+\[\]$/.test(types[cle] ?? '') && (Array.isArray(args[cle]) || args[cle] === null);
  const parametres = cles.map((cle) => (tableauSql(cle) && args[cle] !== null ? litteralTableau(args[cle]) : valeurParametre(args[cle])));
  const liste = cles.map((cle, i) => {
    const v = args[cle];
    let cast = v !== null && typeof v === 'object' && !(v instanceof Date) ? '::jsonb' : '';
    if (tableauSql(cle)) cast = `::${types[cle]}`;
    return `${cle} => $${i + 1}${cast}`;
  });
  return { sql: `select public.${verifierIdentifiant(nom)}(${liste.join(', ')}) as resultat`, parametres };
}

export function construireLecture(table, options = {}) {
  const { eq = {}, gte = {}, lte = {}, dans = {}, ordre, limite, colonnes } = options;
  const parametres = [];
  const conditions = [];
  const ajouter = (cle, operateur, valeur) => {
    parametres.push(valeur);
    conditions.push(`${verifierIdentifiant(cle)} ${operateur} $${parametres.length}`);
  };
  for (const [cle, valeur] of Object.entries(eq)) {
    if (valeur === null) conditions.push(`${verifierIdentifiant(cle)} is null`);
    else ajouter(cle, '=', valeur);
  }
  for (const [cle, valeur] of Object.entries(gte)) ajouter(cle, '>=', valeur);
  for (const [cle, valeur] of Object.entries(lte)) ajouter(cle, '<=', valeur);
  for (const [cle, valeurs] of Object.entries(dans)) {
    if (!valeurs.length) {
      conditions.push('false');
      continue;
    }
    const marques = valeurs.map((v) => {
      parametres.push(v);
      return `$${parametres.length}`;
    });
    conditions.push(`${verifierIdentifiant(cle)} in (${marques.join(', ')})`);
  }
  const selection = colonnes ? colonnes.map(verifierIdentifiant).join(', ') : '*';
  let sql = `select ${selection} from public.${verifierIdentifiant(table)}`;
  if (conditions.length) sql += ` where ${conditions.join(' and ')}`;
  const tri = verifierOrdre(ordre);
  if (tri) {
    const [colonne, sens] = tri;
    sql += ` order by ${verifierIdentifiant(colonne)} ${sens === 'desc' ? 'desc' : 'asc'}`;
  }
  if (limite) sql += ` limit ${Number.parseInt(limite, 10)}`;
  return { sql, parametres };
}

// Les colonnes numeric arrivent en texte par défaut : on les lit comme des nombres,
// comme le fait l'API Supabase en JSON.
const NUMERIC = 1700;
export const optionsPGlite = { parsers: { [NUMERIC]: (valeur) => Number(valeur) } };

export function creerApiLocale(db, lireUtilisateur) {
  const typesConnus = new Map();
  const typesDe = async (nom) => {
    if (!typesConnus.has(nom)) {
      const { rows } = await db.query(
        `select a.nom, format_type(a.type, null) as type
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
         cross join lateral unnest(p.proargnames, p.proargtypes::oid[]) as a(nom, type)
         where p.proname = $1`,
        [nom]
      );
      typesConnus.set(nom, Object.fromEntries(rows.map((r) => [r.nom, r.type])));
    }
    return typesConnus.get(nom);
  };
  return {
    mode: 'local',
    async rpc(nom, args) {
      const { sql, parametres } = construireAppel(nom, args, await typesDe(verifierIdentifiant(nom)));
      return executerComme(db, lireUtilisateur(), async (tx) => (await tx.query(sql, parametres, COMME_SUPABASE)).rows[0]?.resultat ?? null);
    },
    async lire(table, options) {
      const { sql, parametres } = construireLecture(table, options);
      return executerComme(db, lireUtilisateur(), async (tx) => (await tx.query(sql, parametres, COMME_SUPABASE)).rows);
    },
  };
}
