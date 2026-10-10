import { receiveWebhook, verifyWebhook } from "@/server/whatsapp";

/**
 * Webhook de la WhatsApp Business Platform (Meta).
 * GET : vérification de l’abonnement (jeton de vérification affiché dans le hub).
 * POST : messages reçus et accusés de lecture, signés par la clé secrète de
 * l’application Meta (en-tête X-Hub-Signature-256).
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (await verifyWebhook(q.get("hub.mode"), q.get("hub.verify_token")))
    return new Response(q.get("hub.challenge") ?? "", {
      headers: { "Content-Type": "text/plain" },
    });
  return new Response(null, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 200000) return new Response(null, { status: 413 });
  try {
    const ok = await receiveWebhook(
      raw,
      request.headers.get("x-hub-signature-256"),
    );
    return new Response(null, { status: ok ? 200 : 401 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
