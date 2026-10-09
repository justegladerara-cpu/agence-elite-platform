import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "node_modules/**",
    ".pnpm_modules/**",
    ".lockfile/**",
    "assets/font-package/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  { rules: { "@next/next/no-img-element": "off" } },
]);
