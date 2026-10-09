import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./database";
import {
  QuoteInput,
  quoteVolume,
  QuoteState,
  canTransition,
} from "@/domain/quotes";
export type QuoteRecord = {
  id: string;
  reference: string;
  payload: string;
  volume: string;
  status: QuoteState;
  agency: string;
  created_at: string;
  updated_at: string;
};
export type Upload = { mime: string; bytes: Buffer; name: string };
export interface QuoteRepository {
  create(
    input: QuoteInput,
    key: string,
    uploads?: Upload[],
  ): Promise<{ reference: string; created: boolean }>;
  list(): Promise<QuoteRecord[]>;
}
const AUDIT =
  "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)";
export const localQuotes: QuoteRepository = {
  async create(input, key, uploads = []) {
    const database = await db();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .update(
        JSON.stringify(
          uploads.map((u) => ({
            name: u.name,
            mime: u.mime,
            hash: createHash("sha256").update(u.bytes).digest("hex"),
          })),
        ),
      )
      .digest("hex");
    const replay = async () => {
      const existing = await database.get<{
        reference: string;
        fingerprint: string;
      }>("SELECT reference,fingerprint FROM quotes WHERE idempotency=?", key);
      if (!existing) return undefined;
      if (existing.fingerprint !== fingerprint)
        throw new Error("IDEMPOTENCY_CONFLICT");
      return { reference: existing.reference, created: false };
    };
    const already = await replay();
    if (already) return already;
    const id = randomUUID(),
      reference = "EC-" + randomBytes(10).toString("hex").toUpperCase(),
      date = new Date().toISOString();
    try {
      // Demande, pièces et journal d’un seul bloc ; la clé d’idempotence
      // est unique : un second envoi simultané échoue puis est rejoué.
      await database.batch([
        [
          "INSERT INTO quotes(id,reference,idempotency,fingerprint,payload,volume,agency,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
          [
            id,
            reference,
            key,
            fingerprint,
            JSON.stringify(input),
            quoteVolume(input),
            input.agency,
            date,
            date,
          ],
        ],
        ...uploads.map(
          (upload) =>
            [
              "INSERT INTO documents(id,quote_id,name,mime,bytes,created_at) VALUES(?,?,?,?,?,?)",
              [randomUUID(), id, upload.name, upload.mime, upload.bytes, date],
            ] as [string, unknown[]],
        ),
        [AUDIT, ["guest", "quote.created", id, "{}", date]],
      ]);
      return { reference, created: true };
    } catch (e) {
      const raced = await replay();
      if (raced) return raced;
      throw e;
    }
  },
  async list() {
    return (await db()).all<QuoteRecord>(
      "SELECT id,reference,payload,volume,status,agency,created_at,updated_at FROM quotes ORDER BY created_at DESC",
    );
  },
};
/** Changement d’état conditionnel : refusé si l’état a changé entre-temps. */
export async function updateQuote(
  id: string,
  to: QuoteState,
  reason: string,
  actor: string,
) {
  const database = await db();
  const row = await database.get<{ status: QuoteState }>(
    "SELECT status FROM quotes WHERE id=?",
    id,
  );
  if (!row || !canTransition(row.status, to))
    throw new Error("Transition non autorisée");
  const date = new Date().toISOString();
  const result = await database.run(
    "UPDATE quotes SET status=?,updated_at=? WHERE id=? AND status=?",
    to,
    date,
    id,
    row.status,
  );
  if (!result.changes) throw new Error("Transition non autorisée");
  await database.run(
    AUDIT,
    actor,
    "quote.status",
    id,
    JSON.stringify({ from: row.status, to, reason }),
    date,
  );
}
