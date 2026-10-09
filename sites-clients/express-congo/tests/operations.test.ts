import { beforeEach, test, expect } from "vitest";
import { Actor } from "@/domain/operations";
import {
  getEntity,
  listEntities,
  operation,
} from "@/server/operations-repository";
import { db } from "@/server/database";
import { seedAccounts } from "@/server/demo-auth";
const admin: Actor = {
    id: "admin-demo",
    role: "admin",
    agency: "paris",
    organization: null,
  },
  client: Actor = {
    id: "client-demo-a",
    role: "client",
    agency: "paris",
    organization: null,
  },
  otherClient: Actor = {
    id: "client-demo-b",
    role: "client",
    agency: "brazzaville",
    organization: null,
  },
  otherAgent: Actor = {
    id: "agent-brazzaville",
    role: "agent",
    agency: "brazzaville",
    organization: null,
  };
const measures = {
  length: "60",
  width: "40",
  height: "40",
  weight: "12",
  quantity: "3",
  unit: "cm",
};
beforeEach(async () => {
  await seedAccounts();
  const sql = await db();
  await sql.run("DELETE FROM assignments");
  await sql.run("DELETE FROM entities");
});
const create = async () =>
  (await operation(admin, "newShipment", {
    owner: client.id,
    agency: "paris",
    service: "maritime",
    destination: "Brazzaville",
  })) as Awaited<ReturnType<typeof getEntity>>;
test("clients et agences ne lisent ni ne modifient les dossiers d’autrui", async () => {
  const s = await create();
  expect((await getEntity(client, s.id)).id).toBe(s.id);
  for (const actor of [otherClient, otherAgent]) {
    await expect(getEntity(actor, s.id)).rejects.toThrow("ACCESS_DENIED");
    expect(await listEntities(actor)).toHaveLength(0);
    await expect(
      operation(actor, "event", {
        shipmentId: s.id,
        status: "recu-en-agence",
        location: "Paris",
      }),
    ).rejects.toThrow("ACCESS_DENIED");
  }
  await expect(
    operation(client, "event", {
      shipmentId: s.id,
      status: "recu-en-agence",
      location: "Paris",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});
test("réception, départ et remise préservent l’historique et une preuve privée", async () => {
  const s = await create();
  await operation(admin, "receiveParcel", {
    shipmentId: s.id,
    declared: measures,
    controlled: measures,
    description: "Cartons fictifs",
  });
  const departure = (await operation(admin, "newDeparture", {
    agency: "paris",
    mode: "maritime",
    scheduledAt: "2026-12-01T10:00:00Z",
  })) as Awaited<ReturnType<typeof getEntity>>;
  for (const status of ["recu-en-agence", "controle", "en-attente-de-depart"])
    await operation(admin, "event", {
      shipmentId: s.id,
      status,
      location: "Agence de démonstration",
    });
  await operation(admin, "assignDeparture", {
    shipmentId: s.id,
    departureId: departure.id,
  });
  await expect(
    operation(admin, "assignDeparture", {
      shipmentId: s.id,
      departureId: departure.id,
    }),
  ).rejects.toThrow("ASSIGNMENT_CONFLICT");
  for (const status of ["expedie", "arrive", "disponible-au-retrait"])
    await operation(admin, "event", {
      shipmentId: s.id,
      status,
      location: "Agence de démonstration",
    });
  await expect(
    operation(admin, "event", {
      shipmentId: s.id,
      status: "remis",
      location: "Agence",
    }),
  ).rejects.toThrow("WITHDRAWAL_PROOF_REQUIRED");
  await operation(admin, "event", {
    shipmentId: s.id,
    status: "remis",
    location: "Agence",
    proof: "Preuve fictive",
    entitlementConfirmed: true,
  });
  expect((await getEntity(client, s.id)).payload.status).toBe("remis");
  const visible = await listEntities(client);
  expect(visible.filter((e) => e.kind === "event")).toHaveLength(7);
  expect(visible.find((e) => e.kind === "document")?.payload.public).toBe(
    false,
  );
  expect(await listEntities(otherClient)).toHaveLength(0);
});
test("écart de poids bloque l’affectation jusqu’à accord tracé", async () => {
  const s = await create();
  const parcel = (await operation(admin, "receiveParcel", {
    shipmentId: s.id,
    declared: measures,
    controlled: { ...measures, weight: "13" },
    description: "Cartons fictifs",
  })) as Awaited<ReturnType<typeof getEntity>>;
  const departure = (await operation(admin, "newDeparture", {
    agency: "paris",
    mode: "maritime",
    scheduledAt: "2026-12-01T10:00:00Z",
  })) as Awaited<ReturnType<typeof getEntity>>;
  await expect(
    operation(admin, "assignDeparture", {
      shipmentId: s.id,
      departureId: departure.id,
    }),
  ).rejects.toThrow("REVIEW_REQUIRED");
  await operation(admin, "approveMeasures", {
    parcelId: parcel.id,
    reason: "Accord fictif documenté",
  });
  expect(
    await operation(admin, "assignDeparture", {
      shipmentId: s.id,
      departureId: departure.id,
    }),
  ).toEqual({ ok: true });
});
test("proposition versionnée, acceptation propriétaire, aucun paiement confirmé", async () => {
  const s = await create();
  const proposal = (await operation(admin, "proposal", {
    shipmentId: s.id,
    totalMinor: "12000",
    currency: "EUR",
    exclusions: "Exclusions fictives",
    validUntil: "2099-01-01",
  })) as Awaited<ReturnType<typeof getEntity>>;
  await expect(
    operation(otherClient, "acceptProposal", { proposalId: proposal.id }),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    await operation(client, "acceptProposal", { proposalId: proposal.id }),
  ).toEqual({ ok: true, payment: "non-confirme" });
  const revised = (await operation(admin, "proposal", {
    shipmentId: s.id,
    totalMinor: "14000",
    currency: "EUR",
    exclusions: "Nouvelle version fictive",
    validUntil: "2099-01-01",
  })) as Awaited<ReturnType<typeof getEntity>>;
  expect(revised.payload.version).toBe(2);
  expect((await getEntity(client, proposal.id)).payload.totalMinor).toBe(
    "12000",
  );
});
test("une correction ajoute un événement sans effacer l’original", async () => {
  const s = await create();
  const event = (await operation(admin, "event", {
    shipmentId: s.id,
    status: "recu-en-agence",
    location: "Ancien lieu",
  })) as Awaited<ReturnType<typeof getEntity>>;
  const correction = (await operation(admin, "correctEvent", {
    eventId: event.id,
    location: "Lieu corrigé",
    reason: "Correction fictive",
  })) as Awaited<ReturnType<typeof getEntity>>;
  expect((await getEntity(admin, event.id)).payload.location).toBe(
    "Ancien lieu",
  );
  expect(correction.payload.corrects).toBe(event.id);
  expect(
    (await listEntities(client)).filter((e) => e.kind === "event"),
  ).toHaveLength(2);
});
