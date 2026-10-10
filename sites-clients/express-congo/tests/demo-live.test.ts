import { beforeAll, test, expect } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "@/server/database";
import { seedAccounts } from "@/server/demo-auth";
import { compact, DATASET_VERSION, datasetLoaded } from "@/server/demo-seed";
import { advanceLive, LIVE_STEP_MS } from "@/server/live";
import { demoSample, publicTracking } from "@/server/tracking";
import {
  realConnection,
  receiveWebhook,
  saveWhatsApp,
  statusMessage,
  verifyWebhook,
} from "@/server/whatsapp";
import { operation } from "@/server/operations-repository";
import type { Actor } from "@/domain/operations";

const admin: Actor = {
  id: "admin-demo",
  role: "admin",
  agency: "paris",
  organization: null,
};

beforeAll(async () => {
  await seedAccounts();
  // Base de test partagée : on repart d’un jeu complet et neuf.
  await operation(admin, "resetDemo", {});
});

test("le jeu de démonstration est chargé une seule fois, avec des dossiers à chaque étape", async () => {
  expect(await datasetLoaded()).toBe(DATASET_VERSION);
  const rows = await (
    await db()
  ).all<{ kind: string; n: number }>(
    "SELECT kind, count(*) n FROM entities GROUP BY kind",
  );
  const count = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  expect(count.shipment).toBeGreaterThanOrEqual(20);
  expect(count.proposal).toBeGreaterThanOrEqual(15);
  expect(count.payment).toBeGreaterThanOrEqual(10);
  expect(count.message).toBeGreaterThanOrEqual(5);
  const states = await (
    await db()
  ).all<{ s: string }>(
    "SELECT DISTINCT json_extract(payload,'$.status') s FROM entities WHERE kind='shipment'",
  );
  for (const s of [
    "cree",
    "controle",
    "expedie",
    "disponible-au-retrait",
    "remis",
    "incident",
  ])
    expect(states.map((x) => x.s)).toContain(s);
  // Références lisibles, sans identifiant technique.
  const ref = await (
    await db()
  ).get<{ r: string }>(
    "SELECT json_extract(payload,'$.reference') r FROM entities WHERE kind='shipment' LIMIT 1",
  );
  expect(ref?.r).toMatch(/^EC-\d{4}-[A-Z2-9]{4}$/);
  // Les clients portent un nom fictif.
  const named = await (
    await db()
  ).get<{ n: number }>("SELECT count(*) n FROM profiles");
  expect(named?.n).toBeGreaterThanOrEqual(10);
});

test("insertions regroupées : 100 paramètres au plus par requête", () => {
  const rows = Array.from({ length: 40 }, (_, i) => [
    "INSERT INTO t(a,b,c) VALUES(?,?,?)",
    [i, i, i],
  ]) as [string, unknown[]][];
  const out = compact(rows);
  expect(out.length).toBe(2);
  expect(out.every(([, p]) => p.length <= 100)).toBe(true);
  expect(out.flatMap(([, p]) => p).length).toBe(120);
});

test("le dossier en direct avance d’une étape à la fois, puis le suivi le montre", async () => {
  const sample = await demoSample();
  expect(sample).not.toBeNull();
  const before = await publicTracking(sample!.reference, sample!.code);
  expect(before?.live).toBe(true);
  await advanceLive(Date.now() + LIVE_STEP_MS * 3);
  await advanceLive(Date.now() + LIVE_STEP_MS * 3); // même instant : une seule étape
  const after = await publicTracking(sample!.reference, sample!.code);
  expect(after?.version).not.toBe(before?.version);
  expect(after!.events.length).toBeGreaterThanOrEqual(before!.events.length);
});

test("WhatsApp : connexion réelle refusée tant que la démo publique est ouverte", async () => {
  const real = await realConnection(admin);
  expect(real.ok).toBe(false);
  await expect(
    saveWhatsApp(admin, {
      mode: "lien",
      displayNumber: "+33 6 21 93 32 98",
      token: "jeton-de-test",
    }),
  ).rejects.toThrow("REAL_DISABLED");
  const saved = await saveWhatsApp(admin, {
    mode: "lien",
    displayNumber: "+33 6 21 93 32 98",
  });
  expect(saved.displayNumber).toBe("+33621933298");
  expect(saved.token).toBeNull();
  // Webhook : jeton de vérification refusé, signature absente refusée.
  expect(await verifyWebhook("subscribe", saved.verifyToken)).toBe(false);
  const body = JSON.stringify({ entry: [] });
  const sig = "sha256=" + createHmac("sha256", "x").update(body).digest("hex");
  expect(await receiveWebhook(body, sig)).toBe(false);
});

test("une étape enregistrée produit un message WhatsApp (simulé) pour le client", async () => {
  const database = await db();
  const s = await database.get<{ id: string }>(
    "SELECT id FROM entities WHERE kind='shipment' AND json_extract(payload,'$.status')='controle' AND owner='client-demo-a'",
  );
  expect(s).toBeTruthy();
  await operation(admin, "event", {
    shipmentId: s!.id,
    status: "incident",
    location: "Agence de Paris",
    reason: "Test",
  });
  const m = await database.get<{ payload: string }>(
    "SELECT payload FROM entities WHERE kind='message' AND json_extract(payload,'$.shipmentId')=? ORDER BY created_at DESC",
    s!.id,
  );
  expect(JSON.parse(m!.payload).status).toBe("simule");
  expect(
    statusMessage("disponible-au-retrait", "EC-2610-ABCD", "Brazzaville"),
  ).toContain("disponible au retrait à l’agence de Brazzaville");
});

test("réinitialisation de la démonstration par l’administratrice", async () => {
  const r = (await operation(admin, "resetDemo", {})) as { shipments: number };
  expect(r.shipments).toBeGreaterThanOrEqual(20);
  await expect(
    operation(
      { ...admin, id: "client-demo-a", role: "client" },
      "resetDemo",
      {},
    ),
  ).rejects.toThrow("ACCESS_DENIED");
});
