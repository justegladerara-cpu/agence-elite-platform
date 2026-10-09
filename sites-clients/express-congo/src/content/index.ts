import data from "./public.json" with { type: "json" };
import { production } from "@/config";
export const content = data;
export const publicPaths = [
  "/",
  "/services",
  "/tarifs",
  "/devis",
  "/suivi",
  "/prendre-les-mesures",
  "/agences",
  "/professionnels",
  "/faq",
  "/contact",
  ...data.services.map((s) => `/services/${s.slug}`),
  ...data.agencies.map((a) => `/agences/${a.slug}`),
  ...data.pages.map((p) => `/${p.slug}`),
];
/**
 * Information reprise du site officiel, encore à faire valider par
 * Express Congo (EC-026). Affichée telle quelle en démonstration et en
 * préproduction, masquée en production tant qu’elle n’est pas validée.
 */
export function observed(value: string) {
  return production() ? "" : value;
}
/** Affichage lisible ; le lien tel: garde le format international. */
export function formatPhone(e164: string) {
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  if (fr) return `+33 ${fr.slice(1).join(" ")}`;
  const cg = /^\+242(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (cg) return `+242 ${cg.slice(1).join(" ")}`;
  return e164;
}
