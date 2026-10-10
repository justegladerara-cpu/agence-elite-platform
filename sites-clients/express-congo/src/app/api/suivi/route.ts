import { NextResponse } from "next/server";
import { rateLimit, rateLimited } from "@/server/database";
import { sameOrigin } from "@/server/security";
import { demoSample, publicTracking, trackingEnabled } from "@/server/tracking";

/** Démonstration : référence et code du dossier qui avance en direct. */
export async function GET() {
  if (!trackingEnabled()) return new Response(null, { status: 404 });
  const sample = await demoSample();
  return sample
    ? NextResponse.json(sample, { headers })
    : new Response(null, { status: 404 });
}

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
  const key = "tracking:" + reference.trim().toUpperCase();
  // Actualisation en direct d’un suivi déjà ouvert : plafond large, mais
  // chaque échec compte dans le plafond strict contre l’essai de codes.
  if (input.live === true) {
    if (
      (await rateLimited(key, 8)) ||
      !(await rateLimit("tracking-live:" + key, 3000, 900)) ||
      !(await rateLimit("tracking-global-live", 6000, 600))
    )
      return NextResponse.json(
        { message: "Actualisation suspendue quelques minutes." },
        { status: 429, headers },
      );
    const live = await publicTracking(reference, code);
    if (!live) await rateLimit(key, 8, 900);
    return live
      ? NextResponse.json(live, { headers })
      : NextResponse.json({ message: notFound }, { status: 404, headers });
  }
  // Plafond global et plafond par référence contre l’essai de codes.
  if (
    !(await rateLimit("tracking-global", 300, 600)) ||
    !(await rateLimit(key, 8, 900))
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
