import { NextResponse } from "next/server";
import { isDemo, siteUrl } from "@/config";
import { rateLimit } from "@/server/database";
import {
  corsHeaders,
  listAccounts,
  manageAccount,
  overview,
  platformSession,
  recentActivity,
  setAccess,
  verifyPlatformAdmin,
} from "@/server/platform";

/**
 * API d’administration appelée par l’espace Super Admin de la plateforme
 * Agence Élite. Chemins : etat, comptes, journal, acces, session.
 */
type Context = { params: Promise<{ chemin: string[] }> };

const messages: Record<string, string> = {
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_INPUT: "Valeurs invalides.",
  EMAIL_TAKEN: "Un compte existe déjà avec cette adresse.",
  NOT_FOUND: "Compte introuvable.",
  PUBLIC_DEMO_LOCKED:
    "Compte public de démonstration : son rôle et son mot de passe sont fixes. Fermez plutôt la démo publique.",
  ACCOUNT_DISABLED:
    "Votre compte d’administration Express Congo est désactivé.",
  UNKNOWN_ACTION: "Action inconnue.",
};

function base(request: Request) {
  if (process.env.SITE_URL) return siteUrl().replace(/\/$/, "");
  const host = request.headers.get("host");
  const proto =
    request.url.startsWith("https:") || process.env.DATABASE_DRIVER === "d1"
      ? "https"
      : "http";
  return `${proto}://${host}`;
}

async function guard(request: Request) {
  const headers = corsHeaders(request);
  if (!isDemo())
    return {
      error: NextResponse.json(
        { erreur: "Indisponible." },
        { status: 404, headers },
      ),
    };
  if (!(await rateLimit("plateforme-api", 600, 600)))
    return {
      error: NextResponse.json(
        { erreur: "Trop de requêtes." },
        { status: 429, headers },
      ),
    };
  const admin = await verifyPlatformAdmin(request);
  if (!admin)
    return {
      error: NextResponse.json(
        { erreur: "Réservé aux Super Admins de la plateforme Agence Élite." },
        { status: 403, headers },
      ),
    };
  return { admin, headers };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request, { params }: Context) {
  const g = await guard(request);
  if (g.error) return g.error;
  const [path] = (await params).chemin;
  if (path === "etat")
    return NextResponse.json(await overview(), { headers: g.headers });
  if (path === "comptes")
    return NextResponse.json(
      { comptes: await listAccounts() },
      { headers: g.headers },
    );
  if (path === "journal")
    return NextResponse.json(
      { journal: await recentActivity() },
      { headers: g.headers },
    );
  return NextResponse.json(
    { erreur: "Introuvable." },
    { status: 404, headers: g.headers },
  );
}

export async function POST(request: Request, { params }: Context) {
  const g = await guard(request);
  if (g.error) return g.error;
  if (Number(request.headers.get("content-length") || 0) > 4000)
    return new Response(null, { status: 413, headers: g.headers });
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const [path] = (await params).chemin;
  try {
    if (path === "comptes")
      return NextResponse.json(
        await manageAccount(g.admin, input, base(request)),
        {
          headers: g.headers,
        },
      );
    if (path === "acces")
      return NextResponse.json(
        { access: await setAccess(g.admin, input) },
        { headers: g.headers },
      );
    if (path === "session") {
      const s = await platformSession(g.admin);
      return NextResponse.json(
        { ...s, url: base(request) + s.path },
        { headers: g.headers },
      );
    }
    return NextResponse.json(
      { erreur: "Introuvable." },
      { status: 404, headers: g.headers },
    );
  } catch (e) {
    const code = (e as Error).message;
    return NextResponse.json(
      { erreur: messages[code] || "Opération impossible." },
      { status: code === "NOT_FOUND" ? 404 : 422, headers: g.headers },
    );
  }
}
