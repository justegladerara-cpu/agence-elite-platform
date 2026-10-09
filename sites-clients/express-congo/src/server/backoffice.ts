import { db } from "./database";
import { localQuotes, updateQuote } from "./quote-repository";
import { Actor, canRead, canWrite } from "@/domain/operations";
import { QuoteInput, QuoteState, quoteStates } from "@/domain/quotes";

/** Vue d’une demande de devis du site, limitée à ce que l’équipe doit traiter. */
export type QuoteView = {
  id: string;
  reference: string;
  status: QuoteState;
  agency: string;
  createdAt: string;
  updatedAt: string;
  volume: string;
  kind: string;
  service: string;
  destination: string;
  description: string;
  parcels: number;
  desiredDate: string;
  customs: string;
  city: string;
  name: string;
  email: string;
  phone: string;
  channel: string;
  comment: string;
};
export type AuditView = {
  id: number;
  actor: string;
  action: string;
  objectId: string;
  createdAt: string;
};

const quoteScope = (actor: Actor, agency: string) =>
  actor.role !== "client" &&
  canRead(actor, { owner: "", agency, kind: "quote" });

export async function visibleQuotes(actor: Actor): Promise<QuoteView[]> {
  return (await localQuotes.list())
    .filter((q) => quoteScope(actor, q.agency))
    .map((q) => {
      const p = JSON.parse(q.payload) as QuoteInput;
      return {
        id: q.id,
        reference: q.reference,
        status: q.status,
        agency: q.agency,
        createdAt: q.created_at,
        updatedAt: q.updated_at,
        volume: q.volume,
        kind: p.kind,
        service: p.service,
        destination: p.destination,
        description: String(p.description || "").slice(0, 500),
        parcels:
          p.parcels?.reduce((s, x) => s + Number(x.quantity || 0), 0) ?? 0,
        desiredDate: p.desiredDate || "",
        customs: p.customs || "",
        city: p.city || "",
        name: p.name,
        email: p.email,
        phone: p.phone,
        channel: p.channel,
        comment: String(p.comment || "").slice(0, 500),
      };
    });
}

/** Changement d’état contrôlé côté serveur : rôle, agence puis transition. */
export async function setQuoteStatus(
  actor: Actor,
  id: unknown,
  to: unknown,
  reason: unknown,
) {
  if (typeof id !== "string" || !quoteStates.includes(to as QuoteState))
    throw new Error("INVALID_INPUT");
  const row = await (
    await db()
  ).get<{ agency: string }>("SELECT agency FROM quotes WHERE id=?", id);
  if (!row || !quoteScope(actor, row.agency) || !canWrite(actor, "quote"))
    throw new Error("ACCESS_DENIED");
  const motive =
    typeof reason === "string" && reason.trim()
      ? reason.trim().slice(0, 500)
      : "Mise à jour depuis la gestion";
  try {
    await updateQuote(id, to as QuoteState, motive, actor.id);
  } catch {
    throw new Error("INVALID_TRANSITION");
  }
  return { id, status: to };
}

/** Journal d’audit : réservé à l’administrateur, sans contenu métier. */
export async function recentAudit(
  actor: Actor,
  limit = 40,
): Promise<AuditView[]> {
  if (actor.role !== "admin") return [];
  return (
    await (
      await db()
    ).all<{
      id: number;
      actor: string;
      action: string;
      object_id: string;
      created_at: string;
    }>(
      "SELECT id,actor,action,object_id,created_at FROM audit ORDER BY id DESC LIMIT ?",
      limit,
    )
  ).map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    objectId: r.object_id,
    createdAt: r.created_at,
  }));
}
