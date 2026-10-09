import { currentActor } from "@/server/demo-auth";
import { getEntity, listEntities } from "@/server/operations-repository";
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor || actor.role === "client")
    return new Response(null, { status: 403 });
  try {
    const departure = await getEntity(
      actor,
      new URL(request.url).searchParams.get("id") || "",
    );
    if (departure.kind !== "departure")
      return new Response(null, { status: 404 });
    const shipments = (await listEntities(actor)).filter(
      (i) => i.kind === "shipment" && i.payload.departure === departure.id,
    );
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "_")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      "DEMONSTRATION;reference;service;etat",
      ...shipments.map((i) =>
        [
          "DEMONSTRATION",
          i.payload.reference,
          i.payload.service,
          i.payload.status,
        ]
          .map(cell)
          .join(";"),
      ),
    ].join("\r\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="manifeste-demo.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response(null, { status: 403 });
  }
}
