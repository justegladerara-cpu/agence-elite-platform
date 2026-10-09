import { test, expect } from "@playwright/test";
import { publicPaths } from "../../src/content";
test("toutes les routes publiques, fichiers et liens internes répondent", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const checked = new Set<string>();
  for (const path of publicPaths) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    const links = await page
      .locator('a[href^="/"],img[src^="/"]')
      .evaluateAll((elements) =>
        elements.map(
          (e) => e.getAttribute("href") || e.getAttribute("src") || "",
        ),
      );
    for (const href of new Set(links)) {
      if (checked.has(href)) continue;
      checked.add(href);
      const r = await request.get(href);
      expect(r.status(), href).toBeLessThan(400);
    }
  }
});
test("calculateur et reprise des mesures dans le devis", async ({ page }) => {
  await page.goto("/prendre-les-mesures");
  await page.getByLabel("Longueur", { exact: true }).fill("60");
  await page.getByLabel("Largeur", { exact: true }).fill("40");
  await page.getByLabel("Hauteur", { exact: true }).fill("40");
  await page.getByLabel("Poids réel (kg)").fill("12");
  await page.getByLabel("Quantité", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Calculer le volume" }).click();
  await expect(page.getByRole("status")).toContainText("0,288 m³");
  await page
    .getByRole("button", { name: "Ajouter ces colis à mon devis" })
    .click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByLabel("Longueur", { exact: true })).toHaveValue("60");
});
test("devis persisté avec référence et sans faux email", async ({ page }) => {
  await page.goto("/devis");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page
    .getByLabel("Nature des marchandises")
    .fill("Cartons fictifs pour test");
  await page.getByLabel("Longueur", { exact: true }).fill("60");
  await page.getByLabel("Largeur", { exact: true }).fill("40");
  await page.getByLabel("Hauteur", { exact: true }).fill("40");
  await page.getByLabel("Poids réel (kg)").fill("12");
  await page.getByLabel("Quantité", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Votre ville").fill("Ville fictive");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Nom et prénom").fill("Client Démo");
  await page.getByLabel("Téléphone avec indicatif").fill("+33000000000");
  await page.getByLabel("Email", { exact: true }).fill("demo@example.invalid");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.locator(".recap")).toContainText("0,288 m³");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enregistrer la demande" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Votre demande est enregistrée",
  );
  await expect(page.getByRole("status")).toContainText("Aucun email");
});
test("permissions, fonctionnalités désactivées et noindex", async ({
  request,
}) => {
  expect((await request.get("/api/editor")).status()).toBe(401);
  expect((await request.post("/api/editor", { data: {} })).status()).toBe(403);
  // Suivi : origine contrôlée, champs obligatoires, réponse identique si inconnu.
  expect((await request.post("/api/suivi")).status()).toBe(403);
  const origin = process.env.BASE_URL || "http://127.0.0.1:3000";
  expect(
    (
      await request.post("/api/suivi", {
        headers: { Origin: origin },
        data: {},
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/suivi", {
        headers: { Origin: origin },
        data: { reference: "DEMO-EC-INCONNUE", code: "ABCD-EFGH" },
      })
    ).status(),
  ).toBe(404);
  expect((await request.get("/")).headers()["x-robots-tag"]).toContain(
    "noindex",
  );
  expect((await request.get("/robots.txt")).status()).toBe(200);
});
test("redirections historiques et contenus retirés", async ({ request }) => {
  // URL exactes du sitemap WordPress (avec barre finale) : un seul saut.
  const r = await request.get("/2025/07/30/comment-prendre-les-mesures/", {
    maxRedirects: 0,
  });
  expect(r.status()).toBe(301);
  expect(r.headers().location).toBe("/prendre-les-mesures/");
  for (const pdf of [
    "/wp-content/uploads/2025/08/grille-tarifaire.pdf",
    "/wp-content/uploads/2026/09/grille-tarifaire.pdf",
  ]) {
    const p = await request.get(pdf, { maxRedirects: 0 });
    expect(p.status()).toBe(301);
    expect(p.headers().location).toBe("/tarifs/");
  }
  // Pages conservées à l'identique : aucune redirection.
  for (const page of [
    "/a-propos/",
    "/services/",
    "/contact/",
    "/cgv/",
    "/mentions-legales/",
  ])
    expect((await request.get(page, { maxRedirects: 0 })).status()).toBe(200);
  expect(
    (await request.get("/2025/08/02/bonjour-tout-le-monde/")).status(),
  ).toBe(410);
  expect((await request.get("/author/test/")).status()).toBe(410);
});
test("gestion éditoriale authentifiée et sauvegarde persistée", async ({
  page,
}) => {
  await page.goto("/admin");
  await page
    .getByLabel("Mot de passe de démonstration")
    .fill("express-demo-local");
  await page.getByRole("button", { name: "Ouvrir la gestion locale" }).click();
  await page.getByLabel("Page", { exact: true }).selectOption("/actualites");
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Proposition fictive de test");
  await page
    .getByLabel("Texte", { exact: true })
    .fill("Texte de démonstration enregistré pour vérification.");
  await page
    .getByRole("button", { name: "Enregistrer la proposition" })
    .click();
  await expect(page.getByRole("status")).toContainText("enregistrée");
  await page.goto("/actualites");
  await expect(page.locator(".editorial")).toContainText(
    "Proposition fictive de test",
  );
});
for (const width of [360, 390, 768, 1024, 1440])
  test(`affichage ${width}px sans débordement`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/accueil-${width}.png`,
      fullPage: true,
    });
    await page.goto("/prendre-les-mesures");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
