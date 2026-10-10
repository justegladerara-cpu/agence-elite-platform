import { randomUUID } from "node:crypto";
import { db, guardedBatch, REQUIRE_CHANGE } from "./database";
import { isDemo } from "@/config";
import { locationFor } from "./demo-seed";
import { statusMessage } from "./whatsapp";

/**
 * Dossier de démonstration « en direct » : il avance d’une étape à chaque
 * intervalle, puis repart après sa remise. Ainsi, quiconque ouvre le suivi
 * ou l’espace client voit l’information changer sous ses yeux, exactement
 * comme lorsqu’une agence enregistre une étape. Calcul paresseux, au moment
 * des lectures : aucune tâche planifiée. Démonstration uniquement.
 */
export const LIVE_STEP_MS = 70_000;
const RESTART_MS = 180_000;
const CYCLE = [
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];

type Row = {
  id: string;
  owner: string;
  agency: string;
  revision: number;
  payload: string;
};

export async function advanceLive(now = Date.now()) {
  if (!isDemo()) return;
  const database = await db();
  const row = await database.get<Row>(
    "SELECT id,owner,agency,revision,payload FROM entities WHERE kind='shipment' AND json_extract(payload,'$.demoLive')=1",
  );
  if (!row) return;
  const shipment = JSON.parse(row.payload) as Record<string, unknown>;
  const status = String(shipment.status);
  const last = await database.get<{ at: string }>(
    "SELECT max(json_extract(payload,'$.occurredAt')) at FROM entities WHERE kind='event' AND json_extract(payload,'$.shipmentId')=?",
    row.id,
  );
  const lastAt = last?.at ? Date.parse(last.at) : 0;
  const index = CYCLE.indexOf(status);
  const UPDATE =
    "UPDATE entities SET payload=?,revision=revision+1 WHERE id=? AND revision=?";
  try {
    if (status === "remis") {
      if (now - lastAt < RESTART_MS) return;
      // Nouveau tour : on efface les étapes après la préparation au départ.
      await guardedBatch([
        [
          UPDATE,
          [
            JSON.stringify({ ...shipment, status: CYCLE[0] }),
            row.id,
            row.revision,
          ],
        ],
        REQUIRE_CHANGE,
        [
          "DELETE FROM entities WHERE kind='event' AND json_extract(payload,'$.shipmentId')=? AND json_extract(payload,'$.status') IN ('expedie','arrive','formalites-en-cours','disponible-au-retrait','remis')",
          [row.id],
        ],
        [
          "DELETE FROM entities WHERE kind='message' AND json_extract(payload,'$.shipmentId')=? AND json_extract(payload,'$.auto')=1",
          [row.id],
        ],
      ]);
      return;
    }
    if (index < 0 || now - lastAt < LIVE_STEP_MS) return;
    const next = CYCLE[index + 1];
    const service = String(shipment.service),
      dest = String(shipment.destination);
    const at = new Date(now).toISOString();
    const event = {
      shipmentId: row.id,
      status: next,
      location: locationFor(next, service, dest),
      occurredAt: at,
      author: "systeme",
      source: "demo-live",
      public: true,
      reason: "",
      corrects: null,
      auto: 1,
    };
    const statements: [string, unknown[]][] = [
      [
        UPDATE,
        [JSON.stringify({ ...shipment, status: next }), row.id, row.revision],
      ],
      REQUIRE_CHANGE,
      [
        "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
        [
          randomUUID(),
          "event",
          row.owner,
          row.agency,
          JSON.stringify(event),
          at,
        ],
      ],
    ];
    // Message WhatsApp automatique (simulé en démonstration).
    const text = statusMessage(next, String(shipment.reference), dest);
    const profile = await database.get<{ phone: string }>(
      "SELECT phone FROM profiles WHERE user_id=? AND whatsapp=1",
      row.owner,
    );
    if (text && profile)
      statements.push([
        "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
        [
          randomUUID(),
          "message",
          row.owner,
          row.agency,
          JSON.stringify({
            channel: "whatsapp",
            direction: "out",
            phone: profile.phone,
            body: text,
            status: "simule",
            at,
            shipmentId: row.id,
            template: "suivi_etape",
            auto: 1,
          }),
          at,
        ],
      ]);
    await guardedBatch(statements);
  } catch (e) {
    // Une autre lecture a fait avancer le dossier au même instant : rien à faire.
    if ((e as Error).message !== "CONFLICT") throw e;
  }
}
