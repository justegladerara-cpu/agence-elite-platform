import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3000",
    browserName: "chromium",
    // PLAYWRIGHT_EXECUTABLE : chemin d’un Chromium déjà présent (machine sans Chrome).
    ...(process.env.PLAYWRIGHT_EXECUTABLE
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
            args: ["--no-sandbox", "--no-zygote"],
          },
        }
      : {
          channel: (process.env.PLAYWRIGHT_CHANNEL || "chrome") as
            "chrome" | "msedge",
        }),
  },
  // BASE_URL permet de viser un autre serveur (ex. aperçu Cloudflare local).
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          APP_ENV: "demo",
          SITE_URL: "http://127.0.0.1:3000",
          LOCAL_DATABASE_PATH: ".data/e2e.db",
        },
      },
  reporter: [["list"], ["html", { open: "never" }]],
});
