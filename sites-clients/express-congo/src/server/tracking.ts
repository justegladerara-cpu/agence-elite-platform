import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./database";
import { isDemo, feature, production } from "@/config";
import { advanceLive } from "./live";
import { ensureDemoDataset } from "./demo-seed";

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
  /** Dossier de démonstration qui avance seul (démo uniquement). */
  live: boolean;
  /** En route : heure de départ et durée habituelle, pour une position estimée. */
  transit: { departedAt: string; expectedMs: number } | null;
  /** Empreinte de l’état : change dès qu’une étape est enregistrée. */
  version: string;
};

/** Dossier de démonstration en direct, avec son code (démo uniquement). */
export async function demoSample() {
  if (!isDemo()) return null;
  await ensureDemoDataset();
  await advanceLive();
  const row = await (
    await db()
  ).get<{ id: string; payload: string }>(
    "SELECT id,payload FROM entities WHERE kind='shipment' AND json_extract(payload,'$.demoLive')=1",
  );
  if (!row) return null;
  return {
    reference: String(JSON.parse(row.payload).reference),
    code: trackingCode(row.id),
  };
}

type Row = { id: string; payload: string; created_at: string; agency: string };

export async function publicTracking(
  reference: string,
  code: string,
): Promise<PublicTracking | null> {
  const ref = reference.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,60}$/.test(ref) || normalize(code).length !== 8)
    return null;
  if (isDemo()) {
    await ensureDemoDataset();
    await advanceLive();
  }
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
  const visible = events.filter(
    (e) => e.p.public !== false && !corrected.has(e.id),
  );
  const shipped = visible
    .filter((e) => e.p.status === "expedie")
    .map((e) => String(e.p.occurredAt))
    .sort()
    .pop();
  const last =
    visible
      .map((e) => String(e.p.occurredAt))
      .sort()
      .pop() ?? "";
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
    live: shipment.demoLive === true,
    transit:
      shipment.status === "expedie" && shipped
        ? {
            departedAt: shipped,
            expectedMs:
              shipment.service === "aerien" ? 9 * 3600000 : 24 * 86400000,
          }
        : null,
    version: `${shipment.status}:${visible.length}:${last}`,
    events: [
      { status: "cree", location: "", at: row.created_at },
      ...visible.map((e) => ({
        status: String(e.p.status),
        location: String(e.p.location ?? ""),
        at: String(e.p.occurredAt),
      })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
  };
}
