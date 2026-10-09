import { currentActor } from "@/server/demo-auth";
import { getEntity } from "@/server/operations-repository";
import { textPdf } from "@/server/pdf";
import { getPaymentSettings, instructionsFor } from "@/server/payments";
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 401 });
  try {
    const item = await getEntity(
      actor,
      new URL(request.url).searchParams.get("id") || "",
    );
    if (item.kind !== "proposal") return new Response(null, { status: 404 });
    const p = item.payload;
    const currency = String(p.currency);
    const amount = (minor: unknown) => {
      const v = BigInt(String(minor));
      return currency === "EUR"
        ? `${v / 100n},${String(v % 100n).padStart(2, "0")} EUR`
        : `${v} XAF`;
    };
    const lines = (Array.isArray(p.lines) ? p.lines : []) as {
      label: string;
      quantity: number;
      unitMinor: string;
      totalMinor: string;
    }[];
    const bytes = textPdf([
      "EXPRESS CONGO - DEMONSTRATION - NON VALABLE POUR UN ENVOI REEL",
      "",
      "Proposition " + p.number + " - version " + p.version,
      "Validite : " + p.validUntil,
      "",
      ...(lines.length
        ? [
            "Detail",
            ...lines.map(
              (l) =>
                `- ${l.label} : ${String(l.quantity).replace(".", ",")} x ${amount(l.unitMinor)} = ${amount(l.totalMinor)}`,
            ),
            "",
          ]
        : []),
      "TOTAL : " + amount(p.totalMinor),
      "",
      "Conditions, inclusions et exclusions : " + p.exclusions,
      "",
      ...(await (async () => {
        const how = instructionsFor(await getPaymentSettings(), (a) => a);
        return how.length
          ? [
              "Reglement - reference a indiquer : " + p.number,
              ...how.flatMap((m) => [m.title, ...m.lines.map((l) => "  " + l)]),
              "",
            ]
          : [];
      })()),
      "Etat : " + p.status,
      "Une acceptation ne confirme aucun paiement.",
    ]);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="proposition-demo.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 403 });
  }
}
