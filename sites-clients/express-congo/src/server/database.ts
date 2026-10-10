import { production, environment } from "@/config";

/**
 * Accès SQL asynchrone, identique en local (SQLite de Node) et en ligne
 * (Cloudflare D1, même dialecte SQLite). D1 n’accepte pas de transaction
 * interactive : l’atomicité passe par `batch` (un lot exécuté d’un bloc),
 * les contraintes d’unicité et les mises à jour conditionnelles.
 */
export interface Sql {
  get<T>(query: string, ...params: unknown[]): Promise<T | undefined>;
  all<T>(query: string, ...params: unknown[]): Promise<T[]>;
  run(query: string, ...params: unknown[]): Promise<{ changes: number }>;
  batch(statements: [string, unknown[]][]): Promise<void>;
}

export const schema = [
  "CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, idempotency TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, volume TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'nouveau', agency TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, object_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), name TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, status TEXT NOT NULL DEFAULT 'quarantaine', created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS editorial (slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, truth_status TEXT NOT NULL DEFAULT 'PROPOSÉ', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, agency TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, payload TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS demo_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL, agency TEXT NOT NULL, organization TEXT, verified INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS user_sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES demo_users(id), expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS auth_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES demo_users(id), purpose TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS assignments (parcel_id TEXT PRIMARY KEY REFERENCES entities(id), shipment_id TEXT NOT NULL REFERENCES entities(id))",
  "CREATE INDEX IF NOT EXISTS entities_kind ON entities(kind, created_at)",
  "CREATE TABLE IF NOT EXISTS account_status (user_id TEXT PRIMARY KEY REFERENCES demo_users(id), disabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', whatsapp INTEGER NOT NULL DEFAULT 0)",
];

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};
type D1 = {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};

/* D1 renvoie les BLOB en ArrayBuffer ; SQLite local en Uint8Array. */
const bind = (params: unknown[]) =>
  params.map((p) => (p instanceof Buffer ? new Uint8Array(p) : p));

function fromD1(d1: D1): Sql {
  const st = (q: string, p: unknown[]) => d1.prepare(q).bind(...bind(p));
  return {
    async get<T>(q: string, ...p: unknown[]) {
      return ((await st(q, p).first<T>()) ?? undefined) as T | undefined;
    },
    async all<T>(q: string, ...p: unknown[]) {
      return (await st(q, p).all<T>()).results;
    },
    async run(q: string, ...p: unknown[]) {
      return { changes: (await st(q, p).run()).meta.changes ?? 0 };
    },
    async batch(statements) {
      await d1.batch(statements.map(([q, p]) => st(q, p)));
    },
  };
}

type Local = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...p: unknown[]): unknown;
    all(...p: unknown[]): unknown[];
    run(...p: unknown[]): { changes: number | bigint };
  };
};
function fromLocal(local: Local): Sql {
  const plain = <T>(row: unknown) =>
    (row ? { ...(row as object) } : undefined) as T | undefined;
  return {
    async get<T>(q: string, ...p: unknown[]) {
      return plain<T>(local.prepare(q).get(...bind(p)));
    },
    async all<T>(q: string, ...p: unknown[]) {
      return local
        .prepare(q)
        .all(...bind(p))
        .map((r) => plain<T>(r) as T);
    },
    async run(q: string, ...p: unknown[]) {
      return { changes: Number(local.prepare(q).run(...bind(p)).changes) };
    },
    async batch(statements) {
      // Exécution synchrone : aucune autre requête ne peut s’intercaler.
      local.exec("BEGIN IMMEDIATE");
      try {
        for (const [q, p] of statements) local.prepare(q).run(...bind(p));
        local.exec("COMMIT");
      } catch (e) {
        local.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

let pending: Promise<Sql> | undefined;
let d1Ready = false;
async function open(): Promise<Sql> {
  if (process.env.DATABASE_DRIVER === "d1") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as {
      DB?: D1;
    };
    if (!env.DB) throw new Error("Liaison D1 « DB » absente.");
    // Schéma appliqué une fois par instance (idempotent, IF NOT EXISTS).
    if (!d1Ready) {
      await env.DB.batch(schema.map((q) => env.DB!.prepare(q)));
      d1Ready = true;
    }
    return fromD1(env.DB);
  }
  const { DatabaseSync } = await import(
    /* webpackIgnore: true */ "node:sqlite"
  );
  const { mkdirSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const path = resolve(
    /* turbopackIgnore: true */
    process.env.LOCAL_DATABASE_PATH || `.data/${environment()}.db`,
  );
  mkdirSync(dirname(path), { recursive: true });
  const local = new DatabaseSync(path);
  local.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  for (const q of schema) local.exec(q);
  return fromLocal(local as unknown as Local);
}

/** Base de démonstration : interdite en production (EC-025). */
export function db(): Promise<Sql> {
  if (production())
    return Promise.reject(
      new Error(
        "Le stockage de démonstration est interdit en production. EC-025",
      ),
    );
  // En ligne, la liaison D1 appartient à la requête : pas de cache global.
  if (process.env.DATABASE_DRIVER === "d1") return open();
  pending ??= open();
  return pending;
}

/**
 * Garde de lot : placée juste après un UPDATE conditionnel (verrou de
 * révision), elle fait échouer tout le lot si cet UPDATE n’a modifié aucune
 * ligne. SQLite n’autorise RAISE() que dans un déclencheur ; json() sur un
 * texte invalide lève une erreur, évaluée seulement quand changes() vaut 0.
 * D1 et l’adaptateur local annulent alors le lot entier.
 */
export const REQUIRE_CHANGE: [string, unknown[]] = [
  "SELECT json('VERROU_REVISION') WHERE changes() = 0",
  [],
];

/** Lot atomique ; un verrou de révision non satisfait devient « CONFLICT ». */
export async function guardedBatch(statements: [string, unknown[]][]) {
  try {
    await (await db()).batch(statements);
  } catch (e) {
    if (/json|malformed/i.test(String((e as Error)?.message)))
      throw new Error("CONFLICT");
    throw e;
  }
}

/** Limitation d’essais en une seule instruction atomique. */
export async function rateLimit(key: string, limit = 10, seconds = 600) {
  const now = Date.now();
  const row = await (
    await db()
  ).get<{ count: number }>(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expires_at < ? THEN 1 ELSE count + 1 END, expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING count",
    key,
    now + seconds * 1000,
    now,
    now,
  );
  return (row?.count ?? 1) <= limit;
}

/** Le plafond est-il déjà atteint ? (lecture seule, sans compter d’essai) */
export async function rateLimited(key: string, limit = 10) {
  const row = await (
    await db()
  ).get<{ count: number }>(
    "SELECT count FROM rate_limits WHERE key=? AND expires_at>?",
    key,
    Date.now(),
  );
  return (row?.count ?? 0) > limit;
}
