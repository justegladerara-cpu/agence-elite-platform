import { NextResponse } from "next/server";
import { currentActor } from "@/server/demo-auth";
import { sameOrigin } from "@/server/security";
import {
  saveWhatsApp,
  testConnection,
  whatsappView,
  reply,
} from "@/server/whatsapp";

const headers = { "Cache-Control": "no-store" };
const origin = (r: Request) => new URL(r.url).origin;

const messages: Record<string, string> = {
  ACCESS_DENIED: "Seule l’administratrice modifie la connexion WhatsApp.",
  INVALID_PHONE:
    "Numéro WhatsApp invalide : indiquez-le au format international, par exemple +33 6 21 93 32 98.",
  REAL_DISABLED:
    "La connexion réelle n’est pas possible depuis la démonstration publique.",
  CLOUD_INCOMPLETE:
    "Pour activer l’API, renseignez l’identifiant du numéro et le jeton d’accès.",
  KEY_MISSING: "Clé de chiffrement absente du serveur.",
  INVALID_INPUT: "Message vide ou numéro invalide.",
};

export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor || actor.role !== "admin")
    return new Response(null, { status: 403 });
  return NextResponse.json(await whatsappView(actor, origin(request)), {
    headers,
  });
}

/** Enregistrer, tester, ou répondre à un client. */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor || !sameOrigin(request))
    return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 8000)
    return new Response(null, { status: 413 });
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  try {
    if (input.action === "test")
      return NextResponse.json(
        {
          test: await testConnection(actor),
          view: await whatsappView(actor, origin(request)),
        },
        { headers },
      );
    if (input.action === "reply")
      return NextResponse.json(
        await reply(
          actor,
          String(input.owner ?? ""),
          String(input.phone ?? ""),
          String(input.body ?? ""),
        ),
        { status: 201, headers },
      );
    await saveWhatsApp(actor, input);
    return NextResponse.json(
      { view: await whatsappView(actor, origin(request)) },
      { headers },
    );
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json(
      { message: messages[m] || "Réglage non enregistré." },
      { status: m === "ACCESS_DENIED" ? 403 : 422, headers },
    );
  }
}
