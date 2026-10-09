import { db } from "./database";
import type { Actor } from "@/domain/operations";

/**
 * Hub de paiement. Deux familles :
 * - les moyens « hors ligne » (virement sur le compte bancaire de
 *   l’entreprise, Mobile Money MTN et Airtel sur un numéro marchand, espèces
 *   en agence) se configurent ici et s’affichent au client avec la référence
 *   de sa proposition ; l’encaissement est ensuite enregistré par la finance ;
 * - les paiements en ligne (carte bancaire, API Mobile Money) exigent des
 *   clés secrètes. Elles ne sont jamais saisies ni stockées dans l’application :
 *   elles se déposent comme secrets du Worker Cloudflare. Le hub indique
 *   seulement si elles sont présentes, sans jamais les afficher.
 */
export type PaymentSettings = {
  transfer: {
    enabled: boolean;
    holder: string;
    iban: string;
    bic: string;
    bank: string;
  };
  mtn: { enabled: boolean; number: string; name: string };
  airtel: { enabled: boolean; number: string; name: string };
  cash: { enabled: boolean; agencies: string[] };
  instructions: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const emptySettings = (): PaymentSettings => ({
  transfer: { enabled: false, holder: "", iban: "", bic: "", bank: "" },
  mtn: { enabled: false, number: "", name: "" },
  airtel: { enabled: false, number: "", name: "" },
  cash: { enabled: false, agencies: [] },
  instructions: "",
  updatedAt: null,
  updatedBy: null,
});

export const methodLabels: Record<string, string> = {
  transfer: "Virement bancaire",
  mtn: "MTN Mobile Money",
  airtel: "Airtel Money",
  cash: "Espèces en agence",
  card: "Carte bancaire",
};

const AGENCIES = ["paris", "brazzaville", "pointe-noire"];

/** IBAN : 15 à 34 caractères et clé de contrôle modulo 97 (ISO 13616). */
export function validIban(value: string) {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}
/** +242060000000 → +242 06 000 00 00 */
export const formatCongo = (v: string) => {
  const m = /^\+242(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(v);
  return m ? `+242 ${m.slice(1).join(" ")}` : v;
};
export const formatIban = (v: string) =>
  v
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();

const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
/** Numéro Mobile Money du Congo : +242 suivi de 9 chiffres. */
const CONGO_MOBILE = /^\+242\d{9}$/;
const normalizePhone = (v: string) => {
  const d = v.replace(/[^\d+]/g, "");
  if (/^0\d{8}$/.test(d)) return "+242" + d;
  if (/^242\d{9}$/.test(d)) return "+" + d;
  return d;
};

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const row = await (
    await db()
  ).get<{ value: string; updated_at: string; updated_by: string }>(
    "SELECT value,updated_at,updated_by FROM settings WHERE key='payments'",
  );
  if (!row) return emptySettings();
  return {
    ...emptySettings(),
    ...(JSON.parse(row.value) as Partial<PaymentSettings>),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

const str = (v: unknown, max = 120) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function savePaymentSettings(actor: Actor, input: unknown) {
  if (actor.role !== "admin") throw new Error("ACCESS_DENIED");
  const i = (input && typeof input === "object" ? input : {}) as Record<
    string,
    Record<string, unknown>
  >;
  const on = (k: string) => i[k]?.enabled === true;
  const settings = emptySettings();
  settings.transfer = {
    enabled: on("transfer"),
    holder: str(i.transfer?.holder),
    iban: formatIban(str(i.transfer?.iban, 50)),
    bic: str(i.transfer?.bic, 11).toUpperCase().replace(/\s/g, ""),
    bank: str(i.transfer?.bank),
  };
  for (const k of ["mtn", "airtel"] as const)
    settings[k] = {
      enabled: on(k),
      number: normalizePhone(str(i[k]?.number, 20)),
      name: str(i[k]?.name),
    };
  settings.cash = {
    enabled: on("cash"),
    agencies: Array.isArray(i.cash?.agencies)
      ? (i.cash.agencies as unknown[]).filter(
          (a): a is string => typeof a === "string" && AGENCIES.includes(a),
        )
      : [],
  };
  settings.instructions = str(
    (input as Record<string, unknown>)?.instructions,
    600,
  );

  const problems: string[] = [];
  const t = settings.transfer;
  if (t.enabled) {
    if (!t.holder) problems.push("Titulaire du compte manquant.");
    if (!validIban(t.iban))
      problems.push("IBAN invalide : vérifiez le numéro et la clé.");
    if (t.bic && !BIC.test(t.bic))
      problems.push("BIC invalide (8 ou 11 caractères).");
  } else if (t.iban && !validIban(t.iban))
    problems.push("IBAN invalide : vérifiez le numéro et la clé.");
  for (const k of ["mtn", "airtel"] as const) {
    const m = settings[k];
    if (m.enabled && !CONGO_MOBILE.test(m.number))
      problems.push(
        `${methodLabels[k]} : numéro attendu au format +242 suivi de 9 chiffres.`,
      );
    if (m.enabled && !m.name)
      problems.push(`${methodLabels[k]} : nom du compte marchand manquant.`);
  }
  if (settings.cash.enabled && !settings.cash.agencies.length)
    problems.push("Espèces : choisissez au moins une agence.");
  if (problems.length) {
    const e = new Error("INVALID_SETTINGS") as Error & { problems: string[] };
    e.problems = problems;
    throw e;
  }
  const now = new Date().toISOString();
  const { updatedAt: _a, updatedBy: _b, ...value } = settings;
  void _a;
  void _b;
  await (
    await db()
  ).batch([
    [
      "INSERT INTO settings(key,value,updated_at,updated_by) VALUES('payments',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [JSON.stringify(value), now, actor.id],
    ],
    // Journal sans coordonnées bancaires : seulement les moyens actifs.
    [
      "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
      [
        actor.id,
        "payments.settings",
        "payments",
        JSON.stringify({ enabled: enabledMethods(settings) }),
        now,
      ],
    ],
  ]);
  return { ...settings, updatedAt: now, updatedBy: actor.id };
}

export function enabledMethods(s: PaymentSettings) {
  return (["transfer", "mtn", "airtel", "cash"] as const).filter(
    (k) => s[k].enabled,
  );
}

/** Ce qu’un client voit pour régler une proposition. */
export type PayInstruction = { method: string; title: string; lines: string[] };
export function instructionsFor(
  s: PaymentSettings,
  agencyName: (a: string) => string,
): PayInstruction[] {
  const out: PayInstruction[] = [];
  if (s.transfer.enabled)
    out.push({
      method: "transfer",
      title: methodLabels.transfer,
      lines: [
        "Titulaire : " + s.transfer.holder,
        "IBAN : " + s.transfer.iban,
        ...(s.transfer.bic ? ["BIC : " + s.transfer.bic] : []),
        ...(s.transfer.bank ? ["Banque : " + s.transfer.bank] : []),
      ],
    });
  for (const k of ["mtn", "airtel"] as const)
    if (s[k].enabled)
      out.push({
        method: k,
        title: methodLabels[k],
        lines: [
          "Numéro marchand : " + formatCongo(s[k].number),
          "Nom du compte : " + s[k].name,
        ],
      });
  if (s.cash.enabled)
    out.push({
      method: "cash",
      title: methodLabels.cash,
      lines: ["Agences : " + s.cash.agencies.map(agencyName).join(", ")],
    });
  if (out.length && s.instructions)
    out.push({ method: "note", title: "À noter", lines: [s.instructions] });
  return out;
}

/* ---------- Paiement en ligne : emplacements prêts à connecter ---------- */
export type Provider = {
  id: string;
  name: string;
  description: string;
  secrets: string[];
  docs: string;
  status: "non-configure" | "cles-partielles" | "cles-presentes";
};
const providerList: Omit<Provider, "status">[] = [
  {
    id: "stripe",
    name: "Carte bancaire — Stripe",
    description:
      "Paiement par carte (Visa, Mastercard) depuis la proposition, encaissé sur le compte bancaire relié à Stripe.",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    docs: "https://docs.stripe.com/keys",
  },
  {
    id: "mtn-momo",
    name: "MTN MoMo — paiement en ligne",
    description:
      "Demande de paiement envoyée sur le téléphone du client, confirmée automatiquement (API MTN MoMo, selon le contrat marchand).",
    secrets: [
      "MTN_MOMO_SUBSCRIPTION_KEY",
      "MTN_MOMO_API_USER",
      "MTN_MOMO_API_KEY",
    ],
    docs: "https://momodeveloper.mtn.com/",
  },
  {
    id: "airtel-money",
    name: "Airtel Money — paiement en ligne",
    description:
      "Paiement Airtel Money initié depuis la proposition et confirmé automatiquement (API Airtel Africa, selon le contrat marchand).",
    secrets: ["AIRTEL_MONEY_CLIENT_ID", "AIRTEL_MONEY_CLIENT_SECRET"],
    docs: "https://developers.airtel.africa/",
  },
];
export function onlineProviders(): Provider[] {
  return providerList.map((p) => {
    const present = p.secrets.filter((k) => !!process.env[k]).length;
    return {
      ...p,
      status:
        present === 0
          ? "non-configure"
          : present < p.secrets.length
            ? "cles-partielles"
            : "cles-presentes",
    };
  });
}
