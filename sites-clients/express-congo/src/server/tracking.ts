import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./database";
import { isDemo, feature, production } from "@/config";

/**
 * Suivi public limité : une référence d’expédition ET son code de suivi.
 * Le code est dérivé (HMAC) de l’identifiant interne : rien à stocker, rien
 * à recopier, et il ne se devine pas à partir de la référence.
 * Aucune donnée personnelle n’est renvoyée : ni client, ni commentaire
 * interne, ni preuve de remise.
 */
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function secret() {
  const value = process.env.TRACKING_SECRET;
  if (value && value.length >= 32) return value;
  if (isDemo()) return "PUBLIC_DEMO_TRACKING_SECRET_NOT_FOR_PRODUCTION";
  throw new Error("TRACKING_SECRET manquant (32 caractères minimum).");
}

export function trackingEnabled() {
  return !production() && (isDemo() || feature("TRACKING"));
}

/** Code de 8 caractères lisibles (sans 0/O ni 1/I), groupé « ABCD-EFGH ». */
export function trackingCode(shipmentId: string) {
  const mac = createHmac("sha256", secret()).update(shipmentId).digest();
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[mac[i] % alphabet.length];
  return code.slice(0, 4) + "-" + code.slice(4);
}

const normalize = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type PublicTracking = {
  reference: string;
  service: string;
  destination: string;
  status: string;
  parcels: number;
  departure: { scheduledAt: string; confirmed: boolean } | null;
  events: { status: string; location: string; at: string }[];
};

type Row = { id: string; payload: string; created_at: string; agency: string };

export async function publicTracking(
  reference: string,
  code: string,
): Promise<PublicTracking | null> {
  const ref = reference.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,60}$/.test(ref) || normalize(code).length !== 8)
    return null;
  const database = await db();
  const row = await database.get<Row>(
    "SELECT id,payload,created_at,agency FROM entities WHERE kind='shipment' AND upper(json_extract(payload,'$.reference'))=?",
    ref,
  );
  // Comparaison à temps constant, même si la référence est inconnue.
  const expected = Buffer.from(
    normalize(trackingCode(row?.id ?? "reference-inconnue")),
  );
  const given = Buffer.from(normalize(code).padEnd(8, "-").slice(0, 8));
  if (!timingSafeEqual(expected, given) || !row) return null;

  const shipment = JSON.parse(row.payload) as Record<string, unknown>;
  const rows = await database.all<{ id: string; payload: string }>(
    "SELECT id,payload FROM entities WHERE kind IN ('event','parcel','departure') AND (json_extract(payload,'$.shipmentId')=? OR id=?)",
    row.id,
    String(shipment.departure ?? ""),
  );
  const items = rows.map((r) => ({
    id: r.id,
    p: JSON.parse(r.payload) as Record<string, unknown>,
  }));
  const events = items.filter(
    (i) => i.p.status && i.p.shipmentId === row.id && i.p.occurredAt,
  );
  // Un événement corrigé est remplacé par sa correction.
  const corrected = new Set(events.map((e) => e.p.corrects).filter(Boolean));
  const departure = items.find((i) => i.id === shipment.departure);
  return {
    reference: String(shipment.reference),
    service: String(shipment.service),
    destination: String(shipment.destination),
    status: String(shipment.status),
    parcels: items.filter(
      (i) => i.p.shipmentId === row.id && i.p.declared !== undefined,
    ).length,
    departure: departure
      ? {
          scheduledAt: String(
            departure.p.confirmedAt || departure.p.scheduledAt,
          ),
          confirmed: !!departure.p.confirmedAt,
        }
      : null,
    events: [
      { status: "cree", location: "", at: row.created_at },
      ...events
        .filter((e) => e.p.public !== false && !corrected.has(e.id))
        .map((e) => ({
          status: String(e.p.status),
          location: String(e.p.location ?? ""),
          at: String(e.p.occurredAt),
        })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
  };
}
