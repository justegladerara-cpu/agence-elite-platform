import QRCode from "qrcode";
import { currentActor } from "@/server/demo-auth";
import { getEntity } from "@/server/operations-repository";
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor || actor.role === "client")
    return new Response(null, { status: 403 });
  try {
    const item = await getEntity(
      actor,
      new URL(request.url).searchParams.get("id") || "",
    );
    if (item.kind !== "parcel") return new Response(null, { status: 404 });
    const reference = String(item.payload.reference);
    const qr = await QRCode.toDataURL(reference, { width: 180, margin: 2 });
    return new Response(
      `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Étiquette de démonstration</title><body><h1>EXPRESS CONGO — DÉMONSTRATION</h1><p>Référence interne sans données personnelles</p><p>${reference.replace(/[^a-zA-Z0-9-]/g, "")}</p><img src="${qr}" alt="QR code contenant uniquement la référence interne" width="180" height="180"><p>Utiliser la fonction Imprimer du navigateur.</p></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return new Response(null, { status: 403 });
  }
}
