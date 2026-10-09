import { expect, test, beforeEach } from "vitest";
import { volume, validateParcel, ParcelInput } from "@/domain/measurements";
import { validateQuote, QuoteInput, canTransition } from "@/domain/quotes";
import { localQuotes } from "@/server/quote-repository";
import { db, rateLimit } from "@/server/database";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const parcel: ParcelInput = {
  length: "60",
  width: "40",
  height: "40",
  weight: "12",
  quantity: "3",
  unit: "cm",
};
export const quote: QuoteInput = {
  kind: "particulier",
  service: "maritime",
  destination: "Brazzaville",
  description: "Cartons fictifs",
  parcels: [parcel],
  customs: "à préciser",
  desiredDate: "",
  agency: "paris",
  city: "Ville fictive",
  name: "Client Démo",
  email: "demo@example.invalid",
  phone: "+33000000000",
  channel: "email",
  comment: "",
  frequency: "",
  constraints: "",
  privacy: true,
  marketing: false,
};
beforeEach(async () => {
  const sql = await db();
  for (const table of ["documents", "quotes", "audit", "rate_limits"])
    await sql.run(`DELETE FROM ${table}`);
});
test("trois cartons donnent exactement 0,288 m³", () =>
  expect(volume([parcel])).toBe("0.288"));
test("virgule française et mètres donnent le même volume", () =>
  expect(
    volume([
      { ...parcel, length: "0,6", width: "0,4", height: "0,4", unit: "m" },
    ]),
  ).toBe("0.288"));
test("addition et quantité conservent la précision", () =>
  expect(volume([parcel, { ...parcel, quantity: "1" }])).toBe("0.384"));
test("valeurs négatives, vides, nulles, poids invalide et unité refusés", () => {
  for (const value of ["", "-1", "0", "NaN", "1e10"])
    expect(validateParcel({ ...parcel, length: value }).length).toBeTruthy();
  expect(validateParcel({ ...parcel, weight: "0" }).weight).toBeTruthy();
  expect(validateParcel({ ...parcel, quantity: "1.5" }).quantity).toBeTruthy();
  expect(validateParcel({ ...parcel, unit: "mm" as "cm" }).unit).toBeTruthy();
});
test("demande valide et volume repris", async () => {
  expect(validateQuote(quote)).toEqual({});
  await localQuotes.create(quote, "test-key-000000001");
  expect((await localQuotes.list())[0].volume).toBe("0.288");
});
test("double soumission conserve une seule référence", async () => {
  const first = await localQuotes.create(quote, "test-key-000000001"),
    second = await localQuotes.create(quote, "test-key-000000001");
  expect(second.reference).toBe(first.reference);
  expect(second.created).toBe(false);
  expect(await localQuotes.list()).toHaveLength(1);
});
test("soumissions simultanées : une seule demande enregistrée", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      localQuotes.create(quote, "test-key-000000002"),
    ),
  );
  expect(new Set(results.map((r) => r.reference)).size).toBe(1);
  expect(results.filter((r) => r.created)).toHaveLength(1);
  expect(await localQuotes.list()).toHaveLength(1);
});
test("clé rejouée avec contenu changé est refusée", async () => {
  await localQuotes.create(quote, "test-key-000000001");
  await expect(
    localQuotes.create(
      { ...quote, name: "Autre client" },
      "test-key-000000001",
    ),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
test("pièces et demande atomiques, sans duplication", async () => {
  const uploads = [
    {
      name: "test.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-test"),
    },
  ];
  await localQuotes.create(quote, "test-key-000000001", uploads);
  await localQuotes.create(quote, "test-key-000000001", uploads);
  expect(
    (
      await (
        await db()
      ).get<{ n: number }>("SELECT count(*) AS n FROM documents")
    )?.n,
  ).toBe(1);
});
test("états commerciaux ne confirment pas un paiement", () => {
  expect(canTransition("nouveau", "acceptee")).toBe(false);
  expect(canTransition("nouveau", "en-etude")).toBe(true);
  expect(canTransition("acceptee", "en-etude")).toBe(false);
});
test("limitation persistée des essais", async () => {
  expect(await rateLimit("test", 2)).toBe(true);
  expect(await rateLimit("test", 2)).toBe(true);
  expect(await rateLimit("test", 2)).toBe(false);
  expect(await rateLimit("test", 2)).toBe(false);
});
test("profil, route, téléphone et vie privée validés serveur", () => {
  expect(
    validateQuote({ ...quote, destination: "Kinshasa" as "Brazzaville" })
      .destination,
  ).toBeTruthy();
  expect(
    validateQuote({ ...quote, privacy: false, phone: "0600000000" }),
  ).toHaveProperty("privacy");
});
test("sauvegarde et restauration récupèrent devis et pièces privées", async () => {
  await localQuotes.create(quote, "test-key-000000001", [
    {
      name: "test.pdf",
      mime: "application/pdf",
      bytes: Buffer.from("%PDF-test"),
    },
  ]);
  const suffix = randomUUID(),
    backup = resolve(`.data/backup-${suffix}.db`),
    restored = resolve(`.data/restored-${suffix}.db`);
  await (await db()).run("VACUUM INTO ?", backup);
  const result = spawnSync(
    process.execPath,
    ["scripts/db.mjs", "restore", backup],
    {
      env: { ...process.env, APP_ENV: "demo", LOCAL_DATABASE_PATH: restored },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
  const snapshot = new DatabaseSync(restored);
  expect(snapshot.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(1);
  expect(snapshot.prepare("SELECT count(*) n FROM documents").get()?.n).toBe(1);
  expect(
    snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check,
  ).toBe("ok");
  snapshot.close();
});
test("garde-fou de publication refuse les données non approuvées", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/publication-check.mjs"],
    { env: { ...process.env, APP_ENV: "production" }, encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Build de production refusé");
});
