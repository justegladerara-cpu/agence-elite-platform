import { NextResponse } from "next/server";
import { isDemo } from "@/config";
import { sameOrigin } from "@/server/security";
import { rateLimit } from "@/server/database";
import {
  demoAccounts,
  demoMfa,
  signIn,
  signOut,
  currentActor,
  ssoSignIn,
  accessSettings,
} from "@/server/demo-auth";
export async function GET() {
  if (!isDemo()) return new Response(null, { status: 404 });
  // Démo publique fermée depuis la plateforme : aucun identifiant n’est exposé.
  const open = (await accessSettings()).demoPublic;
  return NextResponse.json(
    {
      actor: await currentActor(),
      accounts: open ? demoAccounts : [],
      secondStep: open ? demoMfa() : null,
      password: open ? "DemoExpress!2026" : null,
      mode: "demo",
      demoPublic: open,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!isDemo() || !sameOrigin(request))
    return new Response(null, { status: 403 });
  if (!(await rateLimit("demo-signin", 100, 600)))
    return new Response(null, { status: 429 });
  const input = await request.json().catch(() => ({}));
  // Lien à usage unique ouvert depuis la plateforme Agence Élite.
  if (typeof input.sso === "string")
    try {
      return NextResponse.json({ actor: await ssoSignIn(input.sso) });
    } catch {
      return NextResponse.json(
        { message: "Lien expiré ou déjà utilisé." },
        { status: 401 },
      );
    }
  if (
    typeof input.email !== "string" ||
    typeof input.password !== "string" ||
    input.password.length > 200
  )
    return new Response(null, { status: 400 });
  try {
    return NextResponse.json({
      actor: await signIn(
        input.email,
        input.password,
        String(input.code || ""),
      ),
    });
  } catch {
    return NextResponse.json({ message: "Accès refusé." }, { status: 401 });
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  await signOut();
  return new Response(null, { status: 204 });
}
