import { NextResponse } from "next/server";
import { currentActor } from "@/server/demo-auth";
import { sameOrigin } from "@/server/security";
import {
  getPaymentSettings,
  savePaymentSettings,
  onlineProviders,
} from "@/server/payments";

const headers = { "Cache-Control": "no-store" };

/** Configuration lisible par l’administration et la finance. */
export async function GET() {
  const actor = await currentActor();
  if (!actor || !["admin", "finance"].includes(actor.role))
    return new Response(null, { status: 403 });
  return NextResponse.json(
    { settings: await getPaymentSettings(), providers: onlineProviders() },
    { headers },
  );
}

/** Modification réservée à l’administrateur. */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor || !sameOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 8000)
    return new Response(null, { status: 413 });
  const input = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(
      { settings: await savePaymentSettings(actor, input) },
      { headers },
    );
  } catch (e) {
    const err = e as Error & { problems?: string[] };
    if (err.message === "ACCESS_DENIED")
      return NextResponse.json(
        { message: "Seul l’administrateur modifie les moyens de paiement." },
        { status: 403, headers },
      );
    return NextResponse.json(
      {
        message: "Configuration non enregistrée.",
        problems: err.problems || [],
      },
      { status: 422, headers },
    );
  }
}
