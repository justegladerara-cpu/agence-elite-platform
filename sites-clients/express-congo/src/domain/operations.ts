export type Role =
  "admin" | "manager" | "agent" | "sales" | "finance" | "client";
export type Actor = {
  id: string;
  role: Role;
  agency: string;
  organization: string | null;
};
export type Entity = {
  id: string;
  kind: string;
  owner: string;
  agency: string;
  revision: number;
  payload: Record<string, unknown>;
  createdAt: string;
};
export function canRead(
  actor: Actor,
  item: Pick<Entity, "owner" | "agency" | "kind">,
) {
  if (actor.role === "admin") return true;
  if (actor.role === "client")
    return (
      item.owner === actor.id &&
      [
        "quote",
        "proposal",
        "shipment",
        "parcel",
        "event",
        "ticket",
        "document",
        "payment",
        "message",
      ].includes(item.kind)
    );
  if (actor.agency !== item.agency) return false;
  if (actor.role === "finance")
    return ["proposal", "payment"].includes(item.kind);
  if (actor.role === "sales")
    return ["quote", "proposal", "shipment", "event", "ticket"].includes(
      item.kind,
    );
  return !["payment", "user"].includes(item.kind);
}
export function canWrite(actor: Actor, kind: string) {
  if (actor.role === "admin") return true;
  if (actor.role === "client") return kind === "ticket";
  if (actor.role === "finance") return kind === "payment";
  if (actor.role === "sales")
    return ["quote", "proposal", "ticket"].includes(kind);
  return [
    "quote",
    "parcel",
    "shipment",
    "event",
    "departure",
    "ticket",
    "document",
    "message",
  ].includes(kind);
}
export const shipmentStates = [
  "cree",
  "recu-en-agence",
  "controle",
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
  "incident",
  "en-attente-information",
  "annule",
] as const;
export type ShipmentState = (typeof shipmentStates)[number];
const next: Record<ShipmentState, ShipmentState[]> = {
  cree: ["recu-en-agence", "annule"],
  "recu-en-agence": ["controle", "incident", "en-attente-information"],
  controle: ["en-attente-de-depart", "incident"],
  "en-attente-de-depart": ["expedie", "incident"],
  expedie: ["arrive", "incident"],
  arrive: ["formalites-en-cours", "disponible-au-retrait", "incident"],
  "formalites-en-cours": ["disponible-au-retrait", "incident"],
  "disponible-au-retrait": ["remis", "incident"],
  remis: [],
  incident: [
    "en-attente-information",
    "controle",
    "en-attente-de-depart",
    "expedie",
    "arrive",
    "formalites-en-cours",
    "disponible-au-retrait",
    "annule",
  ],
  "en-attente-information": ["controle", "en-attente-de-depart", "annule"],
  annule: [],
};
export function shipmentTransition(from: string, to: string) {
  return next[from as ShipmentState]?.includes(to as ShipmentState) === true;
}
