import { ParcelInput, validateParcel, volume } from "./measurements";
export const services = ["aerien", "maritime", "conteneur", "conseil"] as const;
export type QuoteInput = {
  kind: "particulier" | "professionnel";
  service: (typeof services)[number];
  destination: "Brazzaville" | "Pointe-Noire";
  description: string;
  parcels: ParcelInput[];
  customs: string;
  desiredDate: string;
  agency: "paris" | "brazzaville" | "pointe-noire";
  city: string;
  name: string;
  email: string;
  phone: string;
  channel: "email" | "telephone";
  comment: string;
  frequency: string;
  constraints: string;
  privacy: boolean;
  marketing: boolean;
};
export function validateQuote(q: QuoteInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!["particulier", "professionnel"].includes(q.kind))
    errors.kind = "Choisissez votre profil.";
  if (!services.includes(q.service)) errors.service = "Choisissez un service.";
  if (!["Brazzaville", "Pointe-Noire"].includes(q.destination))
    errors.destination = "Choisissez une destination en République du Congo.";
  if (
    typeof q.description !== "string" ||
    q.description.trim().length < 3 ||
    q.description.length > 2000
  )
    errors.description = "Décrivez votre marchandise (3 à 2 000 caractères).";
  if (!Array.isArray(q.parcels) || !q.parcels.length || q.parcels.length > 50)
    errors.parcels = "Ajoutez entre 1 et 50 lignes de colis.";
  else
    q.parcels.forEach((p, i) => {
      if (!p || Object.keys(validateParcel(p)).length)
        errors[`parcels.${i}`] =
          "Vérifiez les dimensions, le poids et la quantité.";
    });
  if (!["paris", "brazzaville", "pointe-noire"].includes(q.agency))
    errors.agency = "Choisissez une agence.";
  if (
    typeof q.name !== "string" ||
    q.name.trim().length < 2 ||
    q.name.length > 120
  )
    errors.name = "Indiquez votre nom (2 à 120 caractères).";
  if (
    typeof q.email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(q.email) ||
    q.email.length > 254
  )
    errors.email = "Indiquez une adresse email valide.";
  if (typeof q.phone !== "string" || !/^\+\d[\d ()-]{6,20}$/.test(q.phone))
    errors.phone = "Ajoutez l’indicatif, par exemple +33 ou +242.";
  if (!["email", "telephone"].includes(q.channel))
    errors.channel = "Choisissez un canal de réponse.";
  if (q.privacy !== true)
    errors.privacy = "Prenez connaissance du traitement de votre demande.";
  if (
    q.desiredDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(q.desiredDate) ||
      !Number.isFinite(Date.parse(q.desiredDate)))
  )
    errors.desiredDate = "Date invalide.";
  for (const key of [
    "comment",
    "frequency",
    "constraints",
    "city",
    "customs",
  ] as const)
    if (typeof q[key] !== "string" || q[key].length > 2000)
      errors[key] = "Texte limité à 2 000 caractères.";
  return errors;
}
export function quoteVolume(q: QuoteInput) {
  return volume(q.parcels);
}
export const quoteStates = [
  "nouveau",
  "a-completer",
  "en-etude",
  "proposition-envoyee",
  "acceptee",
  "refusee",
  "expiree",
] as const;
export type QuoteState = (typeof quoteStates)[number];
const transitions: Record<QuoteState, QuoteState[]> = {
  nouveau: ["a-completer", "en-etude"],
  "a-completer": ["en-etude"],
  "en-etude": ["a-completer", "proposition-envoyee"],
  "proposition-envoyee": ["en-etude", "acceptee", "refusee", "expiree"],
  acceptee: [],
  refusee: [],
  expiree: [],
};
export function canTransition(from: QuoteState, to: QuoteState) {
  return transitions[from]?.includes(to) === true;
}
