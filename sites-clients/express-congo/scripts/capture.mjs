import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.env.SITE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const context = await browser.newContext({
  baseURL: base,
  reducedMotion: "reduce",
});
const page = await context.newPage();
if (!(await context.request.get("/api/demo/session")).ok())
  throw new Error("Une démonstration locale active est nécessaire.");
await mkdir("docs/screenshots", { recursive: true });
for (const width of [390, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  for (const [route, name] of [
    ["/devis", "devis"],
    ["/prendre-les-mesures", "mesures"],
  ]) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/screenshots/${name}-${width}.png`,
      fullPage: true,
    });
  }
}
await page.goto("/demo");
await page
  .getByLabel("Compte", { exact: true })
  .selectOption("client-a@example.invalid");
await page.getByLabel("Mot de passe", { exact: true }).fill("DemoExpress!2026");
await page
  .getByRole("button", { name: "Se connecter à la démonstration" })
  .click();
await page.getByRole("button", { name: "Expéditions", exact: true }).waitFor();
for (const width of [390, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `docs/screenshots/portail-${width}.png`,
    fullPage: true,
  });
}
await page.goto("/");
await page.keyboard.press("Tab");
const skip = await page.evaluate(
  () => document.activeElement?.getAttribute("href") === "#main",
);
const limited = await browser.newContext({
  baseURL: base,
  viewport: { width: 390, height: 900 },
  reducedMotion: "reduce",
});
const mobile = await limited.newPage();
const cdp = await limited.newCDPSession(mobile);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 150,
  downloadThroughput: 75000,
  uploadThroughput: 37500,
  connectionType: "cellular3g",
});
await mobile.addInitScript(() => {
  window.ecMetrics = { lcp: null, cls: 0 };
  new PerformanceObserver((list) => {
    for (const item of list.getEntries()) window.ecMetrics.lcp = item.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const item of list.getEntries())
      if (!item.hadRecentInput) window.ecMetrics.cls += item.value;
  }).observe({ type: "layout-shift", buffered: true });
});
await mobile.goto("/", { waitUntil: "load", timeout: 60000 });
await mobile.waitForTimeout(1000);
const metrics = await mobile.evaluate(() => window.ecMetrics);
await writeFile(
  "docs/PERFORMANCE.md",
  `# Vérification locale, ${new Date().toISOString()}\n\nLaboratoire uniquement : Chrome, viewport 390 × 900, latence 150 ms, téléchargement 75 000 octets/s, upload 37 500 octets/s, cache navigateur neuf. Ce n’est pas une mesure au 75e percentile d’utilisateurs réels.\n\n- LCP observé : ${Math.round(metrics.lcp || 0)} ms.\n- CLS observé : ${metrics.cls.toFixed(4)}.\n- INP : non mesuré.\n- Premier Tab atteint le lien d’évitement : ${skip ? "oui" : "non"}.\n\nCaptures des guides, devis et portail aux largeurs 390 et 1 440 px. Vérification visuelle manuelle des captures ; aucune conformité WCAG complète n’est annoncée.\n`,
);
await browser.close();
console.log({ keyboardSkip: skip, ...metrics });
