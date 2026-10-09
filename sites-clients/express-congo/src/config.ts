export type Environment = "development" | "demo" | "staging" | "production";
export function environment(): Environment {
  const value = process.env.APP_ENV || "demo";
  if (!["development", "demo", "staging", "production"].includes(value))
    throw new Error("APP_ENV invalide");
  return value as Environment;
}
export const switches = [
  "PRICING_ENGINE",
  "VOLUMETRIC_WEIGHT",
  "TRACKING",
  "CLIENT_ACCOUNTS",
  "PICKUP",
  "HOME_DELIVERY",
  "ONLINE_PAYMENT",
  "NOTIFY_EMAIL",
  "NOTIFY_SMS",
  "NOTIFY_WHATSAPP",
  "TESTIMONIALS",
  "XAF_DISPLAY",
] as const;
export type Feature = (typeof switches)[number];
export function feature(name: Feature) {
  return process.env[`FEATURE_${name}`] === "true";
}
export function isDemo() {
  return ["demo", "development"].includes(environment());
}
export function production() {
  return environment() === "production";
}
export function enabledRoutes() {
  return (process.env.ROUTES_ENABLED || "FR-CG")
    .split(",")
    .filter((x) => x === "FR-CG");
}
export function siteUrl() {
  return process.env.SITE_URL || "http://127.0.0.1:3000";
}
