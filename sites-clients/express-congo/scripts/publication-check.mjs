import { readFile } from "node:fs/promises";
const environment = process.env.APP_ENV || "demo";
if (environment === "production") {
  const content = JSON.parse(await readFile("src/content/public.json", "utf8"));
  if (
    content.status !== "VALIDÉ" ||
    !content.validatedBy ||
    !content.validatedAt
  )
    throw new Error(
      "EC-026: contenu public non validé. Build de production refusé.",
    );
  if (JSON.stringify(content).includes("[À CONFIRMER"))
    throw new Error("Placeholder public interdit en production.");
  for (const agency of content.agencies)
    if (
      agency.status !== "VALIDÉ" ||
      !agency.validatedBy ||
      !agency.validatedAt
    )
      throw new Error("Coordonnées non validées: " + agency.slug);
  throw new Error(
    "EC-025: persistance et authentification de production non raccordées. Publication bloquée.",
  );
}
console.log(
  `Contrôle publication: ${environment} non indexable, données non validées autorisées avec marquage.`,
);
