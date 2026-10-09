import { NextResponse } from "next/server";
import { isDemo } from "@/config";
import {
  sameOrigin,
  safeEqual,
  createEditorSession,
  logout,
} from "@/server/security";
import { rateLimit } from "@/server/database";
export async function POST(request: Request) {
  if (!isDemo())
    return NextResponse.json(
      { message: "Accès de démonstration désactivé." },
      { status: 403 },
    );
  if (!sameOrigin(request))
    return NextResponse.json(
      { message: "Origine non autorisée." },
      { status: 403 },
    );
  if (!(await rateLimit("editor-login", 8, 600)))
    return NextResponse.json(
      { message: "Réessayez plus tard." },
      { status: 429 },
    );
  const input = await request.json().catch(() => ({}));
  if (
    !safeEqual(
      String(input.password || ""),
      process.env.DEMO_EDITOR_PASSWORD || "express-demo-local",
    )
  )
    return NextResponse.json({ message: "Accès refusé." }, { status: 401 });
  await createEditorSession();
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  await logout();
  return new Response(null, { status: 204 });
}
