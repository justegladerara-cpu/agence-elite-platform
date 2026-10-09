import { NextResponse } from "next/server";
import { isDemo, siteUrl } from "@/config";
import { sameOrigin } from "@/server/security";
import { rateLimit } from "@/server/database";
import {
  register,
  verifyEmail,
  requestReset,
  resetPassword,
} from "@/server/demo-auth";

const headers = { "Cache-Control": "no-store" };
const messages: Record<string, string> = {
  INVALID_EMAIL: "Saisissez une adresse email valide.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit compter au moins 10 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
  PASSWORD_TOO_WEAK:
    "Le mot de passe doit contenir au moins une lettre et un chiffre.",
  INVALID_TOKEN:
    "Ce lien n’est plus valable. Il a peut-être déjà servi ou expiré : faites une nouvelle demande.",
  INVALID_INPUT: "Vérifiez les informations saisies.",
};

/** Adresse publique utilisée dans les liens des messages simulés. */
function base(request: Request) {
  if (process.env.SITE_URL) return siteUrl().replace(/\/$/, "");
  return new URL(request.headers.get("origin") || siteUrl()).origin;
}

export async function POST(request: Request) {
  if (!isDemo()) return new Response(null, { status: 404 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4000)
    return new Response(null, { status: 413 });
  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const action = String(input.action || "");
  if (!["register", "verify", "forgot", "reset"].includes(action))
    return NextResponse.json({ message: "Action inconnue." }, { status: 400 });
  if (!(await rateLimit("account-" + action, 60, 600)))
    return NextResponse.json(
      { message: "Trop de demandes. Réessayez dans quelques minutes." },
      { status: 429, headers },
    );
  const str = (k: string) => String(input[k] ?? "").slice(0, 300);
  try {
    if (action === "register")
      return NextResponse.json(
        {
          message:
            "Demande enregistrée. Confirmez votre adresse depuis le message reçu.",
          mailbox: await register(
            str("email"),
            str("password"),
            str("agency"),
            base(request),
          ),
        },
        { status: 201, headers },
      );
    if (action === "verify") {
      await verifyEmail(str("token"));
      return NextResponse.json(
        { message: "Adresse confirmée. Vous pouvez vous connecter." },
        { headers },
      );
    }
    if (action === "forgot")
      return NextResponse.json(
        {
          message:
            "Si un compte actif correspond à cette adresse, un lien de réinitialisation lui est envoyé.",
          mailbox: await requestReset(str("email"), base(request)),
        },
        { headers },
      );
    await resetPassword(str("token"), str("password"));
    return NextResponse.json(
      { message: "Mot de passe modifié. Connectez-vous avec le nouveau." },
      { headers },
    );
  } catch (e) {
    const code = (e as Error).message;
    return NextResponse.json(
      { message: messages[code] || "La demande n’a pas pu aboutir." },
      { status: code === "ACCESS_DENIED" ? 403 : 422, headers },
    );
  }
}
