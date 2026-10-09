import type { Entity } from "@/domain/operations";
import { volume } from "@/domain/measurements";

export type Tone = "ok" | "wait" | "bad" | "move" | "";
/* Libellés lisibles ; les identifiants techniques restent ceux du domaine. */
export const states: Record<string, [string, Tone]> = {
  cree: ["Créée", ""],
  "recu-en-agence": ["Reçue en agence", "move"],
  controle: ["Contrôlée", "move"],
  "en-attente-de-depart": ["En attente de départ", "wait"],
  expedie: ["Expédiée", "move"],
  arrive: ["Arrivée", "move"],
  "formalites-en-cours": ["Formalités en cours", "wait"],
  "disponible-au-retrait": ["Disponible au retrait", "ok"],
  remis: ["Remise au client", "ok"],
  incident: ["Incident", "bad"],
  "en-attente-information": ["En attente d’information", "wait"],
  annule: ["Annulée", "bad"],
  previsionnel: ["Prévisionnel", "wait"],
  confirme: ["Confirmé", "ok"],
  nouveau: ["Nouvelle", "wait"],
  "a-completer": ["À compléter", "wait"],
  "en-etude": ["En étude", "move"],
  "proposition-envoyee": ["Proposition envoyée", "move"],
  acceptee: ["Acceptée", "ok"],
  refusee: ["Refusée", "bad"],
  expiree: ["Expirée", ""],
  repondu: ["Répondue", "ok"],
  "a-payer": ["À encaisser", "wait"],
  partiel: ["Partiellement réglée", "move"],
  payee: ["Réglée", "ok"],
};
export const stateLabel = (v: unknown) =>
  (states[String(v)] || [String(v ?? "—")])[0];
export const roles: Record<string, string> = {
  admin: "administrateur",
  manager: "responsable d’agence",
  agent: "agent",
  sales: "commercial",
  finance: "finance",
  client: "client",
};
export const agencies: Record<string, string> = {
  paris: "Paris",
  brazzaville: "Brazzaville",
  "pointe-noire": "Pointe-Noire",
};
export const services: Record<string, string> = {
  aerien: "Fret aérien",
  maritime: "Fret maritime",
  conteneur: "Conteneur complet",
  conseil: "Conseil à définir",
};
/* Ordre du parcours d’une expédition, pour les graphiques et les filtres. */
export const pipeline = [
  "cree",
  "recu-en-agence",
  "controle",
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];
export const quoteNext: Record<string, string[]> = {
  nouveau: ["en-etude", "a-completer"],
  "a-completer": ["en-etude"],
  "en-etude": ["proposition-envoyee", "a-completer"],
  "proposition-envoyee": ["acceptee", "refusee", "expiree", "en-etude"],
};
export const actions: Record<string, string> = {
  "shipment.created": "Expédition ouverte",
  "shipment.updated": "Expédition mise à jour",
  "parcel.created": "Colis réceptionné",
  "parcel.updated": "Colis mis à jour",
  "departure.created": "Départ programmé",
  "departure.updated": "Départ mis à jour",
  "shipment.transferred": "Expédition transférée d’agence",
  "account.registered": "Compte client créé",
  "payment.created": "Encaissement enregistré",
  "payments.settings": "Moyens de paiement modifiés",
  "account.verified": "Adresse email confirmée",
  "account.reset": "Mot de passe réinitialisé",
  "event.created": "Suivi mis à jour",
  "event.updated": "Événement corrigé",
  "proposal.created": "Proposition envoyée",
  "proposal.accepted": "Proposition acceptée",
  "ticket.created": "Demande d’assistance",
  "ticket.updated": "Réponse d’assistance",
  "quote.created": "Demande de devis reçue",
  "quote.status": "Demande de devis mise à jour",
};
export const shortRef = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 18 ? s.slice(0, 16) + "…" : s;
};
export const tz = (agency: string) =>
  agency === "paris" ? "Europe/Paris" : "Africa/Brazzaville";
export const date = (v: unknown, agency = "paris", withTime = true) =>
  v
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" } : {}),
        timeZone: tz(agency),
      }).format(new Date(String(v)))
    : "—";
export function measures(m: unknown) {
  if (!m || typeof m !== "object") return "—";
  const p = m as Record<string, string>;
  return `${p.length} × ${p.width} × ${p.height} ${p.unit || "cm"} · ${p.weight} kg × ${p.quantity}`;
}
export const minorToMajor = (minor: number, currency: string) =>
  minor / (currency === "EUR" ? 100 : 1);
export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "XAF" ? 0 : 2,
  }).format(minorToMajor(minor, currency));
/** Volume exact (domaine) des colis contrôlés, en m³ affichés à 3 décimales. */
export function parcelVolume(parcels: Entity[]): number {
  const lines = parcels
    .map((p) => p.payload.controlled as Record<string, string> | undefined)
    .filter(Boolean)
    .map((c) => ({
      length: String(c!.length),
      width: String(c!.width),
      height: String(c!.height),
      weight: String(c!.weight),
      quantity: String(c!.quantity),
      unit: (c!.unit === "m" ? "m" : "cm") as "cm" | "m",
    }));
  let total = 0;
  // Le domaine accepte 50 lignes par calcul : on additionne par tranches.
  for (let i = 0; i < lines.length; i += 50)
    try {
      total += Number(volume(lines.slice(i, i + 50)));
    } catch {
      /* ligne invalide ignorée : déjà refusée à la saisie */
    }
  return total;
}
export function parcelWeight(parcels: Entity[]): number {
  return parcels.reduce((sum, p) => {
    const c = p.payload.controlled as Record<string, string> | undefined;
    if (!c) return sum;
    const w = Number(String(c.weight).replace(",", "."));
    const q = Number(c.quantity);
    return sum + (Number.isFinite(w) && Number.isFinite(q) ? w * q : 0);
  }, 0);
}
export const fr = (n: number, digits = 0) =>
  new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
