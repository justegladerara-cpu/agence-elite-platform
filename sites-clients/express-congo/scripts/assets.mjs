import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = "https://expresscongo.fr/wp-content/uploads/2025/08/";
const entries = [
  "logo-expresscongo.png",
  "ae_1_banniere.png",
  "m_1_banniere.png",
  "cc_1_banniere.png",
  "red-plane.png",
  "red-boat.png",
  "red-container.png",
  "comment-mesurer.jpg",
].map((name) => ({ name, url: base + name }));
entries.push({
  name: "favicon.png",
  url: "https://expresscongo.fr/wp-content/uploads/2025/10/cropped-logo-expresscongo-32x32.png",
});
entries.push({
  name: "grille-tarifaire-source.pdf",
  url: "https://expresscongo.fr/wp-content/uploads/2026/09/grille-tarifaire.pdf",
});
await mkdir("assets", { recursive: true });
await mkdir("public/assets", { recursive: true });
const sources = [];
for (const entry of entries) {
  const response = await fetch(entry.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${entry.name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile("assets/" + entry.name, bytes);
  // Unapproved tariff PDF is archived only, never exposed as an active tariff.
  if (!entry.name.endsWith(".pdf"))
    await writeFile("public/assets/" + entry.name, bytes);
  sources.push({
    ...entry,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    status: "OBSERVÉ",
    rights: "À_CONFIRMER",
    retrievedAt: new Date().toISOString(),
  });
}
await writeFile("assets/SOURCES.json", JSON.stringify(sources, null, 2) + "\n");
console.log(`${sources.length} ressources récupérées et archivées.`);
