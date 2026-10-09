import { NextResponse } from "next/server";
import { rateLimit } from "@/server/database";
import { sameOrigin } from "@/server/security";
import { publicTracking, trackingEnabled } from "@/server/tracking";

const headers = { "Cache-Control": "no-store" };
const notFound =
  "Aucune expédition ne correspond à cette référence et à ce code. Vérifiez-les auprès de votre agence.";

export async function POST(request: Request) {
  if (!trackingEnabled())
    return NextResponse.json(
      { message: "Le suivi en ligne n’est pas activé." },
      { status: 503, headers },
    );
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const reference = String(input.reference ?? "").slice(0, 80),
    code = String(input.code ?? "").slice(0, 20);
  if (!reference.trim() || !code.trim())
    return NextResponse.json(
      { message: "Saisissez la référence et le code de suivi." },
      { status: 400, headers },
    );
  // Plafond global et plafond par référence contre l’essai de codes.
  if (
    !(await rateLimit("tracking-global", 300, 600)) ||
    !(await rateLimit("tracking:" + reference.trim().toUpperCase(), 8, 900))
  )
    return NextResponse.json(
      { message: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers },
    );
  const result = await publicTracking(reference, code);
  return result
    ? NextResponse.json(result, { headers })
    : NextResponse.json({ message: notFound }, { status: 404, headers });
}
