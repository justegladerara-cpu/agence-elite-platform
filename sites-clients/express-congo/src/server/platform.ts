import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./database";
import {
  accessSettings,
  demoAccounts,
  issueToken,
  seedAccounts,
} from "./demo-auth";
import { getPaymentSettings, enabledMethods } from "./payments";
import { onlineProviders } from "./payments";
import { environment } from "@/config";

/**
 * Administration d’Express Congo depuis la plateforme Agence Élite.
 *
 * Aucun secret partagé : la plateforme envoie le jeton de session Supabase de
 * la personne connectée ; Express Congo demande à la base de la plateforme
 * (fonction `est_super_admin`) si ce jeton appartient à un Super Admin actif.
 * La clé utilisée est la clé « publishable » de la plateforme, publique par
 * nature ; la sécurité repose sur la base de la plateforme.
 */
export type PlatformAdmin = { id: string; email: string };

const DEFAULT_ORIGINS = [
  "https://saas.agence-elite.fr",
  "https://agence-elite-saas.pages.dev",
  "https://agence-elite-platform.justegladerara.workers.dev",
];

export function platformConfig() {
  return {
    url: (process.env.PLATEFORME_SUPABASE_URL || "").replace(/\/$/, ""),
    key: process.env.PLATEFORME_SUPABASE_KEY || "",
    origins: (process.env.PLATEFORME_ORIGINES || DEFAULT_ORIGINS.join(","))
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  };
}

/** Origines autorisées : liste exacte, plus les sous-domaines https de agence-elite.fr. */
export function allowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (platformConfig().origins.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+\.agence-elite\.fr$/.test(origin);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const base = { "Cache-Control": "no-store", Vary: "Origin" };
  if (!allowedOrigin(origin)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
  };
}

/** Vérifie le jeton auprès de la plateforme ; renvoie le Super Admin ou null. */
export async function verifyPlatformAdmin(
  request: Request,
  f: typeof fetch = fetch,
): Promise<PlatformAdmin | null> {
  const { url, key } = platformConfig();
  if (!url || !key || !allowedOrigin(request.headers.get("origin")))
    return null;
  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/i.exec(
    request.headers.get("authorization") || "",
  )?.[1];
  if (!token) return null;
  const headers = {
    apikey: key,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  try {
    const check = await f(`${url}/rest/v1/rpc/est_super_admin`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!check.ok || (await check.json()) !== true) return null;
    const user = await f(`${url}/auth/v1/user`, { headers });
    if (!user.ok) return null;
    const u = (await user.json()) as { id?: string; email?: string };
    if (!u.id) return null;
    return { id: String(u.id), email: String(u.email || "super-admin") };
  } catch {
    return null;
  }
}

const ROLES = ["admin", "manager", "agent", "sales", "finance", "client"];
const AGENCIES = ["paris", "brazzaville", "pointe-noire"];
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const publicIds = new Set<string>(demoAccounts.map((a) => a.id));
const actorId = (a: PlatformAdmin) => "plateforme:" + a.email;

async function audit(
  admin: PlatformAdmin,
  action: string,
  id: string,
  detail: unknown,
) {
  await (
    await db()
  ).run(
    "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
    actorId(admin),
    action,
    id,
    JSON.stringify(detail),
    new Date().toISOString(),
  );
}

export type ManagedAccount = {
  id: string;
  email: string;
  role: string;
  agency: string;
  verified: boolean;
  disabled: boolean;
  publicDemo: boolean;
  platform: boolean;
  activeSessions: number;
};

export async function listAccounts(): Promise<ManagedAccount[]> {
  await seedAccounts();
  const rows = await (
    await db()
  ).all<{
    id: string;
    email: string;
    role: string;
    agency: string;
    verified: number;
    disabled: number | null;
    sessions: number;
  }>(
    `SELECT u.id,u.email,u.role,u.agency,u.verified,s.disabled,
      (SELECT count(*) FROM user_sessions x WHERE x.user_id=u.id AND x.expires_at>?) AS sessions
     FROM demo_users u LEFT JOIN account_status s ON s.user_id=u.id
     ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'finance' THEN 2 WHEN 'sales' THEN 3 WHEN 'agent' THEN 4 ELSE 5 END, u.email`,
    Date.now(),
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    agency: r.agency,
    verified: !!r.verified,
    disabled: !!r.disabled,
    publicDemo: publicIds.has(r.id),
    platform: r.id.startsWith("plateforme-"),
    activeSessions: Number(r.sessions),
  }));
}

export async function overview() {
  const sql = await db();
  const count = async (q: string, ...p: unknown[]) =>
    Number((await sql.get<{ n: number }>(q, ...p))?.n ?? 0);
  const kinds = await sql.all<{ kind: string; n: number }>(
    "SELECT kind, count(*) AS n FROM entities GROUP BY kind",
  );
  const pay = await getPaymentSettings();
  const last = await sql.get<{ created_at: string }>(
    "SELECT created_at FROM audit ORDER BY id DESC LIMIT 1",
  );
  return {
    environment: environment(),
    access: await accessSettings(),
    counts: {
      ...Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
      quotes: await count("SELECT count(*) AS n FROM quotes"),
      accounts: await count("SELECT count(*) AS n FROM demo_users"),
      activeSessions: await count(
        "SELECT count(*) AS n FROM user_sessions WHERE expires_at>?",
        Date.now(),
      ),
    },
    payments: {
      methods: enabledMethods(pay),
      online: onlineProviders().map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
      })),
    },
    lastActivity: last?.created_at ?? null,
  };
}

export async function recentActivity(limit = 60) {
  return (
    await (
      await db()
    ).all<{
      id: number;
      actor: string;
      action: string;
      object_id: string;
      created_at: string;
    }>(
      "SELECT id,actor,action,object_id,created_at FROM audit ORDER BY id DESC LIMIT ?",
      Math.min(Math.max(limit, 1), 200),
    )
  ).map((a) => ({
    id: a.id,
    actor: a.actor,
    action: a.action,
    objectId: a.object_id,
    createdAt: a.created_at,
  }));
}

const fail = (code: string) => new Error(code);

/** Lien d’activation ou de réinitialisation à transmettre à la personne. */
const activationLink = (base: string, token: string) =>
  `${base}/demo/?reinitialiser=${token}`;

export async function manageAccount(
  admin: PlatformAdmin,
  input: Record<string, unknown>,
  base: string,
) {
  await seedAccounts();
  const sql = await db();
  const action = String(input.action || "");
  const str = (k: string, max = 200) =>
    typeof input[k] === "string"
      ? (input[k] as string).trim().slice(0, max)
      : "";

  if (action === "create") {
    const email = str("email").toLowerCase(),
      role = str("role"),
      agency = str("agency");
    if (!EMAIL.test(email)) throw fail("INVALID_EMAIL");
    if (!ROLES.includes(role) || !AGENCIES.includes(agency))
      throw fail("INVALID_INPUT");
    if (await sql.get("SELECT id FROM demo_users WHERE email=?", email))
      throw fail("EMAIL_TAKEN");
    const id = (role === "client" ? "client-" : "equipe-") + randomUUID();
    // Mot de passe aléatoire jamais communiqué : la personne choisit le sien via le lien.
    const salt = randomBytes(16).toString("hex");
    await sql.run(
      "INSERT INTO demo_users VALUES(?,?,?,?,?,?,NULL,0)",
      id,
      email,
      randomBytes(64).toString("hex"),
      salt,
      role,
      agency,
    );
    const token = await issueToken(id, "activate");
    await audit(admin, "account.created", id, { role, agency });
    return { id, link: activationLink(base, token), expiresInHours: 72 };
  }

  const id = str("id", 120);
  const account = await sql.get<{ id: string; role: string }>(
    "SELECT id,role FROM demo_users WHERE id=?",
    id,
  );
  if (!account) throw fail("NOT_FOUND");
  const setDisabled = (disabled: boolean) =>
    sql.batch([
      [
        "INSERT INTO account_status(user_id,disabled,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET disabled=excluded.disabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        [id, disabled ? 1 : 0, new Date().toISOString(), actorId(admin)],
      ],
      ...(disabled
        ? [
            ["DELETE FROM user_sessions WHERE user_id=?", [id]] as [
              string,
              unknown[],
            ],
          ]
        : []),
    ]);

  if (action === "update") {
    const role = str("role"),
      agency = str("agency");
    if (!ROLES.includes(role) || !AGENCIES.includes(agency))
      throw fail("INVALID_INPUT");
    if (publicIds.has(id)) throw fail("PUBLIC_DEMO_LOCKED");
    await sql.batch([
      ["UPDATE demo_users SET role=?,agency=? WHERE id=?", [role, agency, id]],
      // Le nouveau rôle s’applique dès la prochaine connexion.
      ["DELETE FROM user_sessions WHERE user_id=?", [id]],
    ]);
    await audit(admin, "account.role", id, {
      from: account.role,
      role,
      agency,
    });
    return { ok: true };
  }
  if (action === "disable" || action === "enable") {
    await setDisabled(action === "disable");
    await audit(admin, "account." + action, id, {});
    return { ok: true };
  }
  if (action === "reset") {
    if (publicIds.has(id)) throw fail("PUBLIC_DEMO_LOCKED");
    const token = await issueToken(id, "activate");
    await audit(admin, "account.reset_link", id, {});
    return { link: activationLink(base, token), expiresInHours: 72 };
  }
  if (action === "revoke") {
    await sql.run("DELETE FROM user_sessions WHERE user_id=?", id);
    await audit(admin, "account.sessions_revoked", id, {});
    return { ok: true };
  }
  throw fail("UNKNOWN_ACTION");
}

export async function setAccess(
  admin: PlatformAdmin,
  input: Record<string, unknown>,
) {
  if (typeof input.demoPublic !== "boolean") throw fail("INVALID_INPUT");
  const now = new Date().toISOString();
  const sql = await db();
  await sql.batch([
    [
      "INSERT INTO settings(key,value,updated_at,updated_by) VALUES('access',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [JSON.stringify({ demoPublic: input.demoPublic }), now, actorId(admin)],
    ],
    // Fermer la démo publique ferme aussi les sessions déjà ouvertes avec ces comptes.
    ...(input.demoPublic
      ? []
      : [...publicIds].map(
          (id) =>
            ["DELETE FROM user_sessions WHERE user_id=?", [id]] as [
              string,
              unknown[],
            ],
        )),
  ]);
  await audit(admin, "access.demo_public", "access", {
    demoPublic: input.demoPublic,
  });
  return accessSettings();
}

/** Compte administrateur personnel du Super Admin, puis code de session à usage unique. */
export async function platformSession(admin: PlatformAdmin) {
  await seedAccounts();
  const sql = await db();
  const id =
    "plateforme-" + admin.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 60);
  // Adresse non utilisable pour une connexion par mot de passe (pas de « @ » final valide).
  await sql.run(
    "INSERT OR IGNORE INTO demo_users VALUES(?,?,?,?,'admin','paris',NULL,1)",
    id,
    "plateforme:" + admin.email,
    randomBytes(64).toString("hex"),
    randomBytes(16).toString("hex"),
  );
  const status = await sql.get<{ disabled: number }>(
    "SELECT disabled FROM account_status WHERE user_id=?",
    id,
  );
  if (status?.disabled) throw fail("ACCOUNT_DISABLED");
  const code = await issueToken(id, "sso");
  await audit(admin, "platform.session", id, {});
  return { code, path: `/demo/?sso=${code}`, expiresInSeconds: 60 };
}
