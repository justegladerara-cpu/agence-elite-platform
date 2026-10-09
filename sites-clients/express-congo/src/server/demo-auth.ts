import {
  scryptSync,
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { Actor, Role } from "@/domain/operations";
import { db } from "./database";
import { isDemo } from "@/config";
import { secureCookies } from "./security";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const demoAccounts = [
  {
    id: "client-demo-a",
    email: "client-a@example.invalid",
    role: "client",
    agency: "paris",
  },
  {
    id: "client-demo-b",
    email: "client-b@example.invalid",
    role: "client",
    agency: "brazzaville",
  },
  {
    id: "agent-paris",
    email: "agent-paris@example.invalid",
    role: "agent",
    agency: "paris",
  },
  {
    id: "agent-brazzaville",
    email: "agent-brazzaville@example.invalid",
    role: "agent",
    agency: "brazzaville",
  },
  {
    id: "admin-demo",
    email: "admin@example.invalid",
    role: "admin",
    agency: "paris",
  },
] as const;
let seeded = false;
export async function seedAccounts() {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  if (seeded) return;
  const database = await db();
  await database.batch(
    demoAccounts.map((user) => {
      const salt = "ec-demo-" + user.id;
      return [
        "INSERT OR IGNORE INTO demo_users VALUES(?,?,?,?,?,?,NULL,1)",
        [
          user.id,
          user.email,
          scryptSync("DemoExpress!2026", salt, 64).toString("hex"),
          salt,
          user.role,
          user.agency,
        ],
      ] as [string, unknown[]];
    }),
  );
  seeded = true;
}
type User = {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  role: Role;
  agency: string;
  organization: string | null;
  verified: number;
};
// Only demonstrates a second step. This public demo secret is forbidden outside demo.
export function demoMfa() {
  const step = Math.floor(Date.now() / 30000),
    buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", "PUBLIC_DEMO_FACTOR_ONLY")
      .update(buffer)
      .digest(),
    offset = mac[mac.length - 1] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
/* ---------- Accès gérés depuis la plateforme Agence Élite ---------- */
export type AccessSettings = { demoPublic: boolean };
/** Comptes de démonstration publics ouverts par défaut ; la plateforme peut les fermer. */
export async function accessSettings(): Promise<AccessSettings> {
  const row = await (
    await db()
  ).get<{ value: string }>("SELECT value FROM settings WHERE key='access'");
  const v = row ? (JSON.parse(row.value) as Partial<AccessSettings>) : {};
  return { demoPublic: v.demoPublic !== false };
}
/** Compte désactivé, ou compte public de démonstration alors que la démo publique est fermée. */
async function blocked(userId: string) {
  const row = await (
    await db()
  ).get<{ disabled: number }>(
    "SELECT disabled FROM account_status WHERE user_id=?",
    userId,
  );
  if (row?.disabled) return true;
  return publicDemoIds.has(userId) && !(await accessSettings()).demoPublic;
}
const publicDemoIds = new Set<string>(demoAccounts.map((a) => a.id));

async function openSession(row: {
  id: string;
  role: Role;
  agency: string;
  organization: string | null;
}) {
  const token = randomBytes(32).toString("hex");
  await (
    await db()
  ).run(
    "INSERT INTO user_sessions VALUES(?,?,?)",
    hash(token),
    row.id,
    Date.now() + 3600000,
  );
  (await cookies()).set("ec-demo-user", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    maxAge: 3600,
    path: "/",
  });
  return {
    id: row.id,
    role: row.role,
    agency: row.agency,
    organization: row.organization,
  };
}

/** Ouverture de session à usage unique, créée depuis la plateforme (60 s). */
export async function ssoSignIn(code: string) {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  const id = await consumeToken(code, "sso");
  if (!id || (await blocked(id))) throw new Error("ACCESS_DENIED");
  const row = await (
    await db()
  ).get<User>("SELECT * FROM demo_users WHERE id=? AND verified=1", id);
  if (!row) throw new Error("ACCESS_DENIED");
  return openSession(row);
}

export async function signIn(email: string, password: string, code: string) {
  await seedAccounts();
  const row = await (
    await db()
  ).get<User>("SELECT * FROM demo_users WHERE email=?", email.toLowerCase());
  const derived = scryptSync(password, row?.salt || "missing-user", 64),
    expected = row ? Buffer.from(row.password_hash, "hex") : Buffer.alloc(64);
  if (
    !row ||
    !row.verified ||
    // Empreinte de taille inattendue : refus propre, jamais d’erreur serveur.
    derived.length !== expected.length ||
    !timingSafeEqual(derived, expected) ||
    // Le code simulé ne vaut que pour les comptes publics de démonstration.
    (row.role === "admin" && publicDemoIds.has(row.id) && code !== demoMfa()) ||
    (await blocked(row.id))
  )
    throw new Error("ACCESS_DENIED");
  return openSession(row);
}
export async function currentActor(): Promise<Actor | null> {
  if (!isDemo()) return null;
  const token = (await cookies()).get("ec-demo-user")?.value;
  if (!token) return null;
  const row = await (
    await db()
  ).get<Actor>(
    "SELECT u.id,u.role,u.agency,u.organization FROM user_sessions s JOIN demo_users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>? AND u.verified=1",
    hash(token),
    Date.now(),
  );
  // Un compte désactivé depuis la plateforme perd l’accès immédiatement.
  return row && !(await blocked(row.id)) ? { ...row } : null;
}
export async function signOut() {
  const jar = await cookies(),
    token = jar.get("ec-demo-user")?.value;
  if (token)
    await (
      await db()
    ).run("DELETE FROM user_sessions WHERE hash=?", hash(token));
  jar.delete("ec-demo-user");
}

/* ---------- Comptes clients : inscription, confirmation, récupération ----------
 * Aucun prestataire d’email n’est raccordé (EC-022). En démonstration, le
 * message qui serait envoyé est renvoyé à l’écran, clairement signalé comme
 * une simulation. Les jetons sont aléatoires, à usage unique, stockés hachés.
 */
export type Mailbox = {
  to: string;
  subject: string;
  body: string;
  link: string;
};
export type Person = { id: string; email: string; role: Role; agency: string };

const reserved = new Set<string>(demoAccounts.map((a) => a.id));
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
const AGENCIES = ["paris", "brazzaville", "pointe-noire"];

export function passwordProblem(password: string) {
  if (password.length < 10) return "PASSWORD_TOO_SHORT";
  if (password.length > 200) return "PASSWORD_TOO_LONG";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return "PASSWORD_TOO_WEAK";
  return null;
}

type Purpose = "verify" | "reset" | "activate" | "sso";
const TTL: Record<Purpose, number> = {
  verify: 24 * 3600000,
  reset: 3600000,
  activate: 72 * 3600000,
  sso: 60000,
};
export async function issueToken(userId: string, purpose: Purpose) {
  const token = randomBytes(32).toString("hex");
  const ttl = TTL[purpose];
  await (
    await db()
  ).batch([
    // Un seul jeton actif par usage : le précédent est révoqué.
    [
      "DELETE FROM auth_tokens WHERE user_id=? AND purpose=?",
      [userId, purpose],
    ],
    [
      "INSERT INTO auth_tokens VALUES(?,?,?,?)",
      [hash(token), userId, purpose, Date.now() + ttl],
    ],
  ]);
  return token;
}

async function consumeToken(token: string, purpose: Purpose) {
  if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
  const row = await (
    await db()
  ).get<{ user_id: string }>(
    "DELETE FROM auth_tokens WHERE hash=? AND purpose=? AND expires_at>? RETURNING user_id",
    hash(token),
    purpose,
    Date.now(),
  );
  return row?.user_id;
}

const audit = async (actor: string, action: string, id: string) =>
  (await db()).run(
    "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
    actor,
    action,
    id,
    "{}",
    new Date().toISOString(),
  );

export async function register(
  email: string,
  password: string,
  agency: string,
  base: string,
): Promise<Mailbox> {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  await seedAccounts();
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) throw new Error("INVALID_EMAIL");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  if (!AGENCIES.includes(agency)) throw new Error("INVALID_INPUT");
  const database = await db();
  const existing = await database.get<{ id: string; verified: number }>(
    "SELECT id,verified FROM demo_users WHERE email=?",
    address,
  );
  // Même réponse à l’écran : seul le contenu du « message » diffère, comme
  // le ferait un vrai email (pas d’énumération des comptes par l’API).
  if (existing?.verified)
    return {
      to: address,
      subject: "Votre compte Express Congo existe déjà",
      body: "Une inscription a été demandée avec cette adresse, mais un compte existe déjà. Connectez-vous ou utilisez « Mot de passe oublié ».",
      link: base + "/demo/",
    };
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64).toString("hex");
  let id = existing?.id;
  if (id) {
    if (reserved.has(id)) throw new Error("ACCESS_DENIED");
    await database.run(
      "UPDATE demo_users SET password_hash=?,salt=?,agency=? WHERE id=? AND verified=0",
      passwordHash,
      salt,
      agency,
      id,
    );
  } else {
    id = "client-" + randomUUID();
    await database.run(
      "INSERT INTO demo_users VALUES(?,?,?,?,'client',?,NULL,0)",
      id,
      address,
      passwordHash,
      salt,
      agency,
    );
    await audit(id, "account.registered", id);
  }
  const token = await issueToken(id, "verify");
  return {
    to: address,
    subject: "Confirmez votre adresse email",
    body: "Bienvenue chez Express Congo. Confirmez votre adresse pour activer votre espace client. Ce lien est valable 24 heures et ne peut servir qu’une fois.",
    link: `${base}/demo/?verifier=${token}`,
  };
}

export async function verifyEmail(token: string) {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  const id = await consumeToken(token, "verify");
  if (!id) throw new Error("INVALID_TOKEN");
  await (await db()).run("UPDATE demo_users SET verified=1 WHERE id=?", id);
  await audit(id, "account.verified", id);
}

export async function requestReset(
  email: string,
  base: string,
): Promise<Mailbox | null> {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  await seedAccounts();
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) throw new Error("INVALID_EMAIL");
  const row = await (
    await db()
  ).get<{ id: string }>(
    "SELECT id FROM demo_users WHERE email=? AND verified=1",
    address,
  );
  // Les comptes publics de démonstration gardent leur mot de passe connu.
  if (!row || reserved.has(row.id)) return null;
  const token = await issueToken(row.id, "reset");
  return {
    to: address,
    subject: "Réinitialisez votre mot de passe",
    body: "Une réinitialisation a été demandée pour votre espace client Express Congo. Ce lien est valable une heure. Si vous n’êtes pas à l’origine de la demande, ignorez ce message.",
    link: `${base}/demo/?reinitialiser=${token}`,
  };
}

export async function resetPassword(token: string, password: string) {
  if (!isDemo()) throw new Error("DEMO_DISABLED");
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  // Lien « mot de passe oublié » ou lien d’activation créé par la plateforme.
  const id =
    (await consumeToken(token, "reset")) ??
    (await consumeToken(token, "activate"));
  if (!id || reserved.has(id)) throw new Error("INVALID_TOKEN");
  const salt = randomBytes(16).toString("hex");
  await (
    await db()
  ).batch([
    [
      "UPDATE demo_users SET password_hash=?,salt=?,verified=1 WHERE id=?",
      [scryptSync(password, salt, 64).toString("hex"), salt, id],
    ],
    // Toutes les sessions ouvertes sont fermées après un changement.
    ["DELETE FROM user_sessions WHERE user_id=?", [id]],
  ]);
  await audit(id, "account.reset", id);
}

/** Personnes visibles par l’acteur : lui-même pour un client, tous pour l’équipe. */
export async function people(actor: Actor | null): Promise<Person[]> {
  if (!actor) return [];
  await seedAccounts();
  const rows = await (
    await db()
  ).all<Person>(
    "SELECT id,email,role,agency FROM demo_users WHERE verified=1 ORDER BY role,email",
  );
  return actor.role === "client" ? rows.filter((r) => r.id === actor.id) : rows;
}
