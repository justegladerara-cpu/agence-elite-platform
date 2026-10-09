import { notFound } from "next/navigation";
import { isDemo } from "@/config";
import {
  currentActor,
  demoAccounts,
  demoMfa,
  people,
  accessSettings,
} from "@/server/demo-auth";
import { listEntities } from "@/server/operations-repository";
import { Operations } from "@/components/operations";
import { visibleQuotes, recentAudit } from "@/server/backoffice";
import { trackingCode } from "@/server/tracking";
import {
  getPaymentSettings,
  instructionsFor,
  onlineProviders,
} from "@/server/payments";
import { agencies } from "@/components/backoffice/labels";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Gestion des expéditions — Démonstration",
  robots: { index: false, follow: false },
  manifest: "/gestion.webmanifest",
  appleWebApp: { title: "EC Gestion", capable: true },
};
export default async function Demo() {
  if (!isDemo()) notFound();
  const actor = await currentActor();
  // Le code de suivi n’est calculé que pour les expéditions déjà visibles.
  const entities = actor
    ? (await listEntities(actor)).map((e) =>
        e.kind === "shipment"
          ? {
              ...e,
              payload: { ...e.payload, trackingCode: trackingCode(e.id) },
            }
          : e,
      )
    : [];
  const settings = actor ? await getPaymentSettings() : null;
  const demoPublic = (await accessSettings()).demoPublic;
  const hub =
    actor && settings && ["admin", "finance"].includes(actor.role)
      ? { settings, providers: onlineProviders() }
      : null;
  return (
    <Operations
      actor={actor}
      entities={entities}
      accounts={demoPublic ? demoAccounts : []}
      people={await people(actor)}
      payInstructions={
        settings ? instructionsFor(settings, (a) => agencies[a] || a) : []
      }
      hub={hub}
      code={demoPublic ? demoMfa() : ""}
      quotes={actor ? await visibleQuotes(actor) : []}
      audit={actor ? await recentAudit(actor) : []}
    />
  );
}
