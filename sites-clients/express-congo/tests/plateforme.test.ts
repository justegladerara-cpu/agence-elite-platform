import { beforeEach, afterEach, test, expect } from "vitest";
import { db } from "@/server/database";
import {
  seedAccounts,
  resetPassword,
  signIn,
  accessSettings,
} from "@/server/demo-auth";
import {
  allowedOrigin,
  corsHeaders,
  listAccounts,
  manageAccount,
  platformSession,
  setAccess,
  verifyPlatformAdmin,
  overview,
} from "@/server/platform";

// next/headers n’existe pas hors requête : on ne teste ici que ce qui n’ouvre pas de cookie.
const admin = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "juste@example.invalid",
};
const token = (link: string) => link.split("=").pop()!;

beforeEach(async () => {
  process.env.PLATEFORME_SUPABASE_URL = "https://plateforme.example.invalid";
  process.env.PLATEFORME_SUPABASE_KEY = "sb_publishable_test";
  await seedAccounts();
  const sql = await db();
  for (const t of [
    "user_sessions",
    "auth_tokens",
    "account_status",
    "rate_limits",
  ])
    await sql.run(`DELETE FROM ${t}`);
  await sql.run("DELETE FROM settings WHERE key='access'");
  await sql.run(
    "DELETE FROM demo_users WHERE id LIKE 'equipe-%' OR id LIKE 'plateforme-%'",
  );
});
afterEach(() => {
  delete process.env.PLATEFORME_SUPABASE_URL;
  delete process.env.PLATEFORME_SUPABASE_KEY;
});

/** Fausse base de la plateforme : seul le jeton « jeton-super-admin » est Super Admin. */
function fakePlatform(calls: string[] = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const auth = (init?.headers as Record<string, string>).authorization;
    calls.push(u.pathname);
    expect((init?.headers as Record<string, string>).apikey).toBe(
      "sb_publishable_test",
    );
    if (u.pathname === "/rest/v1/rpc/est_super_admin")
      return Response.json(auth === "Bearer jeton-super-admin-0123456789");
    if (u.pathname === "/auth/v1/user")
      return Response.json({ id: admin.id, email: admin.email });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}
const request = (origin: string | null, auth?: string) =>
  new Request("https://express-congo.example.invalid/api/plateforme/etat/", {
    headers: {
      ...(origin ? { origin } : {}),
      ...(auth ? { authorization: auth } : {}),
    },
  });

test("seul un Super Admin de la plateforme, depuis une origine autorisée, est accepté", async () => {
  const ok = request(
    "https://saas.agence-elite.fr",
    "Bearer jeton-super-admin-0123456789",
  );
  expect(await verifyPlatformAdmin(ok, fakePlatform())).toEqual(admin);
  // Jeton valide mais pas Super Admin.
  expect(
    await verifyPlatformAdmin(
      request(
        "https://saas.agence-elite.fr",
        "Bearer jeton-simple-membre-012345",
      ),
      fakePlatform(),
    ),
  ).toBeNull();
  // Origine étrangère : refus sans même interroger la plateforme.
  const calls: string[] = [];
  expect(
    await verifyPlatformAdmin(
      request(
        "https://pirate.example.com",
        "Bearer jeton-super-admin-0123456789",
      ),
      fakePlatform(calls),
    ),
  ).toBeNull();
  expect(calls).toEqual([]);
  expect(
    await verifyPlatformAdmin(
      request("https://saas.agence-elite.fr"),
      fakePlatform(),
    ),
  ).toBeNull();
  // Configuration absente : tout est refusé.
  delete process.env.PLATEFORME_SUPABASE_URL;
  expect(await verifyPlatformAdmin(ok, fakePlatform())).toBeNull();
  // CORS : en-têtes seulement pour les origines autorisées.
  expect(allowedOrigin("https://thedream.agence-elite.fr")).toBe(true);
  expect(allowedOrigin("https://agence-elite.fr.pirate.com")).toBe(false);
  expect(
    corsHeaders(request("https://pirate.example.com"))[
      "Access-Control-Allow-Origin"
    ],
  ).toBeUndefined();
  expect(
    corsHeaders(request("https://saas.agence-elite.fr"))[
      "Access-Control-Allow-Origin"
    ],
  ).toBe("https://saas.agence-elite.fr");
});

test("comptes : création par lien d’activation, rôle, désactivation, journal", async () => {
  const created = await manageAccount(
    admin,
    {
      action: "create",
      email: "Agent.Pnr@Example.invalid",
      role: "agent",
      agency: "pointe-noire",
    },
    "https://ec.example.invalid",
  );
  expect(created.link).toMatch(
    /^https:\/\/ec\.example\.invalid\/demo\/\?reinitialiser=[a-f0-9]{64}$/,
  );
  await expect(
    manageAccount(
      admin,
      {
        action: "create",
        email: "agent.pnr@example.invalid",
        role: "agent",
        agency: "paris",
      },
      "x",
    ),
  ).rejects.toThrow("EMAIL_TAKEN");
  await expect(
    manageAccount(
      admin,
      {
        action: "create",
        email: "x@example.invalid",
        role: "pirate",
        agency: "paris",
      },
      "x",
    ),
  ).rejects.toThrow("INVALID_INPUT");
  // Non activé tant que la personne n’a pas choisi son mot de passe.
  let account = (await listAccounts()).find(
    (a) => a.email === "agent.pnr@example.invalid",
  )!;
  expect(account.verified).toBe(false);
  await resetPassword(token(created.link!), "MonMotDePasse2026");
  account = (await listAccounts()).find((a) => a.id === account.id)!;
  expect(account.verified).toBe(true);
  await manageAccount(
    admin,
    {
      action: "update",
      id: account.id,
      role: "manager",
      agency: "brazzaville",
    },
    "x",
  );
  account = (await listAccounts()).find((a) => a.id === account.id)!;
  expect([account.role, account.agency]).toEqual(["manager", "brazzaville"]);
  await manageAccount(admin, { action: "disable", id: account.id }, "x");
  expect(
    (await listAccounts()).find((a) => a.id === account.id)!.disabled,
  ).toBe(true);
  // Désactivé : la connexion est refusée avant même l’ouverture de session.
  await expect(
    signIn("agent.pnr@example.invalid", "MonMotDePasse2026", ""),
  ).rejects.toThrow("ACCESS_DENIED");
  await manageAccount(admin, { action: "enable", id: account.id }, "x");
  const reset = await manageAccount(
    admin,
    { action: "reset", id: account.id },
    "https://ec",
  );
  expect(reset.link).toContain("/demo/?reinitialiser=");
  // Les comptes publics de démonstration ne changent ni de rôle ni de mot de passe.
  await expect(
    manageAccount(
      admin,
      { action: "update", id: "admin-demo", role: "client", agency: "paris" },
      "x",
    ),
  ).rejects.toThrow("PUBLIC_DEMO_LOCKED");
  const journal = await (
    await db()
  ).all<{ actor: string; action: string }>(
    "SELECT actor,action FROM audit WHERE actor=? ORDER BY id",
    "plateforme:" + admin.email,
  );
  expect(journal.map((j) => j.action)).toEqual([
    "account.created",
    "account.role",
    "account.disable",
    "account.enable",
    "account.reset_link",
  ]);
  expect(JSON.stringify(journal)).not.toContain("MonMotDePasse");
});

test("démo publique fermée : comptes publics refusés, état et session plateforme", async () => {
  expect((await accessSettings()).demoPublic).toBe(true);
  await setAccess(admin, { demoPublic: false });
  expect((await accessSettings()).demoPublic).toBe(false);
  const s = await (await db()).get<{ code: string }>("SELECT 1 AS code");
  expect(s).toBeTruthy();
  await expect(
    signIn("client-a@example.invalid", "DemoExpress!2026", ""),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(setAccess(admin, { demoPublic: "non" })).rejects.toThrow(
    "INVALID_INPUT",
  );
  const state = await overview();
  expect(state.access.demoPublic).toBe(false);
  expect(state.counts.accounts).toBeGreaterThan(0);
  // Compte d’administration personnel créé à la première ouverture, code de 60 s.
  const sso = await platformSession(admin);
  expect(sso.path).toMatch(/^\/demo\/\?sso=[a-f0-9]{64}$/);
  const own = (await listAccounts()).find((a) => a.platform)!;
  expect(own.role).toBe("admin");
  expect(own.email).toBe("plateforme:" + admin.email);
  // Ce compte ne s’ouvre jamais par mot de passe.
  await expect(signIn(own.email, "", "")).rejects.toThrow("ACCESS_DENIED");
  await manageAccount(admin, { action: "disable", id: own.id }, "x");
  await expect(platformSession(admin)).rejects.toThrow("ACCOUNT_DISABLED");
});
