import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./database";
import { isDemo, siteUrl } from "@/config";
/**
 * Origine attendue : SITE_URL si défini, sinon le domaine réellement
 * demandé (en-tête Host), identique en local et derrière Cloudflare.
 */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (process.env.SITE_URL)
    return origin === new URL(process.env.SITE_URL).origin;
  const host = request.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
/** Cookies Secure en HTTPS ; COOKIE_SECURE=false réservé aux aperçus locaux en HTTP. */
export const secureCookies = () =>
  process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : siteUrl().startsWith("https:") || process.env.DATABASE_DRIVER === "d1";
export function safeEqual(a: string, b: string) {
  const ah = createHash("sha256").update(a).digest(),
    bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function editorSession() {
  if (!isDemo()) return false;
  const token = (await cookies()).get("ec-demo-editor")?.value;
  if (!token) return false;
  const session = await (
    await db()
  ).get<{ expires_at: number }>(
    "SELECT expires_at FROM sessions WHERE token_hash=?",
    hash(token),
  );
  return !!session && session.expires_at > Date.now();
}
export async function createEditorSession() {
  const token = randomBytes(32).toString("hex");
  await (
    await db()
  ).run("INSERT INTO sessions VALUES(?,?)", hash(token), Date.now() + 3600000);
  (await cookies()).set("ec-demo-editor", token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    maxAge: 3600,
    path: "/",
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("ec-demo-editor")?.value;
  if (token)
    await (
      await db()
    ).run("DELETE FROM sessions WHERE token_hash=?", hash(token));
  jar.delete("ec-demo-editor");
}
