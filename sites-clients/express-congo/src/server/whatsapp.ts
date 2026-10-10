import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { db } from "./database";
import type { Actor } from "@/domain/operations";

/**
 * WhatsApp d’Express Congo, en deux niveaux :
 *
 * 1. « Lien direct » (aucun compte à créer) : chaque bouton ouvre WhatsApp
 *    sur le numéro de l’agence avec un message prérempli (référence du
 *    dossier). Côté gestion, un clic ouvre la conversation avec le client.
 *
 * 2. « WhatsApp Business Platform » (API Cloud de Meta) : le numéro de la
 *    gérante est relié à l’application. Messages automatiques à chaque étape
 *    du suivi (modèle approuvé par Meta), réception des messages des clients
 *    dans la gestion et réponses depuis la gestion.
 *    Le jeton d’accès et la clé secrète de l’application Meta sont chiffrés
 *    (AES-256-GCM, clé WHATSAPP_KEY du Worker) et ne sont jamais renvoyés.
 *
 * Garde-fou de la démonstration publique : tant que les comptes publics de
 * démonstration sont ouverts, la connexion réelle reste simulée. Sinon
 * n’importe quel visiteur pourrait lire les vrais messages ou écrire depuis
 * le vrai numéro.
 */
export const GRAPH = "https://graph.facebook.com";
export const DEFAULT_API_VERSION = "v23.0";
export const DEFAULT_NUMBER = "+33621933298";

type Sealed = { iv: string; tag: string; data: string };
export type WhatsAppSettings = {
  mode: "lien" | "cloud";
  displayNumber: string;
  greeting: string;
  phoneNumberId: string;
  businessAccountId: string;
  apiVersion: string;
  token: Sealed | null;
  appSecret: Sealed | null;
  verifyToken: string;
  templateName: string;
  templateLanguage: string;
  notify: string[];
  lastTest: { ok: boolean; at: string; detail: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
};
/** Ce que voit l’interface : jamais les secrets. */
export type WhatsAppView = Omit<WhatsAppSettings, "token" | "appSecret"> & {
  tokenSet: boolean;
  appSecretSet: boolean;
  keyReady: boolean;
  realAllowed: boolean;
  realReason: string;
  webhookUrl: string;
};

export const NOTIFY_STATUSES = [
  "recu-en-agence",
  "expedie",
  "arrive",
  "disponible-au-retrait",
  "remis",
  "incident",
] as const;

const empty = (): WhatsAppSettings => ({
  mode: "lien",
  displayNumber: DEFAULT_NUMBER,
  greeting: "Bonjour Express Congo, ",
  phoneNumberId: "",
  businessAccountId: "",
  apiVersion: DEFAULT_API_VERSION,
  token: null,
  appSecret: null,
  verifyToken: "",
  templateName: "suivi_etape",
  templateLanguage: "fr",
  notify: [...NOTIFY_STATUSES],
  lastTest: null,
  updatedAt: null,
  updatedBy: null,
});

/* ---------- Chiffrement des secrets ---------- */
function key() {
  const v = process.env.WHATSAPP_KEY;
  return v && v.length >= 32 ? createHash("sha256").update(v).digest() : null;
}
function seal(text: string): Sealed {
  const k = key();
  if (!k) throw new Error("KEY_MISSING");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return {
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
function open(s: Sealed | null): string | null {
  const k = key();
  if (!s || !k) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(s.iv, "base64"));
    d.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([
      d.update(Buffer.from(s.data, "base64")),
      d.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/* ---------- Réglages ---------- */
export async function getWhatsApp(): Promise<WhatsAppSettings> {
  const row = await (
    await db()
  ).get<{ value: string; updated_at: string; updated_by: string }>(
    "SELECT value,updated_at,updated_by FROM settings WHERE key='whatsapp'",
  );
  if (!row) return empty();
  return {
    ...empty(),
    ...(JSON.parse(row.value) as Partial<WhatsAppSettings>),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Connexion réelle permise ? (démo publique fermée, compte non public) */
export async function realConnection(actor?: Actor | null) {
  const { accessSettings, isPublicDemoAccount } = await import("./demo-auth");
  if ((await accessSettings()).demoPublic)
    return {
      ok: false,
      reason:
        "Démonstration publique ouverte : la connexion réelle est simulée. Fermez les comptes publics depuis la plateforme Agence Élite pour relier le vrai numéro.",
    };
  if (actor && isPublicDemoAccount(actor.id))
    return {
      ok: false,
      reason:
        "Ce compte de démonstration ne peut pas relier un vrai numéro. Connectez-vous avec le compte personnel de la gérante.",
    };
  if (!key())
    return {
      ok: false,
      reason:
        "Clé de chiffrement WHATSAPP_KEY absente du serveur : la connexion réelle est désactivée.",
    };
  return { ok: true, reason: "" };
}

export async function whatsappView(
  actor: Actor | null,
  origin: string,
): Promise<WhatsAppView> {
  const s = await getWhatsApp();
  const real = await realConnection(actor);
  const { token: _t, appSecret: _a, ...rest } = s;
  void _t;
  void _a;
  return {
    ...rest,
    verifyToken: s.verifyToken,
    tokenSet: !!s.token,
    appSecretSet: !!s.appSecret,
    keyReady: !!key(),
    realAllowed: real.ok,
    realReason: real.reason,
    webhookUrl: origin.replace(/\/$/, "") + "/api/whatsapp/webhook/",
  };
}

const phone = (v: unknown) => {
  const t = String(v ?? "").replace(/[^\d+]/g, "");
  if (!t) return "";
  const n = t.startsWith("+") ? t : t.startsWith("00") ? "+" + t.slice(2) : t;
  return /^\+\d{8,15}$/.test(n) ? n : "INVALID";
};
const str = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function saveWhatsApp(
  actor: Actor,
  input: Record<string, unknown>,
) {
  if (actor.role !== "admin") throw new Error("ACCESS_DENIED");
  const current = await getWhatsApp();
  const next: WhatsAppSettings = { ...current };
  next.mode = input.mode === "cloud" ? "cloud" : "lien";
  const number = phone(input.displayNumber);
  if (number === "INVALID" || !number) throw new Error("INVALID_PHONE");
  next.displayNumber = number;
  next.greeting = str(input.greeting, 300) || empty().greeting;
  next.phoneNumberId = str(input.phoneNumberId, 40).replace(/\D/g, "");
  next.businessAccountId = str(input.businessAccountId, 40).replace(/\D/g, "");
  next.apiVersion = /^v\d{1,2}\.\d$/.test(str(input.apiVersion, 8))
    ? str(input.apiVersion, 8)
    : DEFAULT_API_VERSION;
  next.templateName =
    str(input.templateName, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "") || "suivi_etape";
  next.templateLanguage = /^[a-z]{2}(_[A-Z]{2})?$/.test(
    str(input.templateLanguage, 6),
  )
    ? str(input.templateLanguage, 6)
    : "fr";
  next.notify = Array.isArray(input.notify)
    ? NOTIFY_STATUSES.filter((s) => (input.notify as unknown[]).includes(s))
    : current.notify;
  const token = str(input.token, 2000),
    secret = str(input.appSecret, 200);
  if (token || secret || input.clearSecrets === true) {
    const real = await realConnection(actor);
    if (!real.ok && !input.clearSecrets) throw new Error("REAL_DISABLED");
    if (input.clearSecrets === true) {
      next.token = null;
      next.appSecret = null;
      next.lastTest = null;
    }
    if (token) next.token = seal(token);
    if (secret) next.appSecret = seal(secret);
  }
  if (!next.verifyToken)
    next.verifyToken = randomBytes(18).toString("base64url");
  if (next.mode === "cloud" && (!next.phoneNumberId || !next.token))
    throw new Error("CLOUD_INCOMPLETE");
  await store(actor.id, next);
  return next;
}

async function store(by: string, s: WhatsAppSettings) {
  const { updatedAt: _a, updatedBy: _b, ...value } = s;
  void _a;
  void _b;
  const now = new Date().toISOString();
  await (
    await db()
  ).batch([
    [
      "INSERT INTO settings(key,value,updated_at,updated_by) VALUES('whatsapp',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [JSON.stringify(value), now, by],
    ],
    [
      "INSERT INTO audit(actor,action,object_id,detail,created_at) VALUES(?,?,?,?,?)",
      [
        by,
        "whatsapp.settings",
        "whatsapp",
        JSON.stringify({ mode: s.mode }),
        now,
      ],
    ],
  ]);
}

/* ---------- API Cloud ---------- */
async function graph(
  s: WhatsAppSettings,
  path: string,
  init?: { method: string; body: unknown },
) {
  const token = open(s.token);
  if (!token) throw new Error("TOKEN_MISSING");
  const r = await fetch(`${GRAPH}/${s.apiVersion}/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const err = data.error as { message?: string; code?: number } | undefined;
    throw new Error(
      "GRAPH:" + (err?.code ?? r.status) + ":" + (err?.message ?? "erreur"),
    );
  }
  return data;
}

/** Vérifie le numéro relié et enregistre le résultat du test. */
export async function testConnection(actor: Actor) {
  if (actor.role !== "admin") throw new Error("ACCESS_DENIED");
  const s = await getWhatsApp();
  const real = await realConnection(actor);
  let result: { ok: boolean; at: string; detail: string };
  if (!real.ok)
    result = { ok: false, at: new Date().toISOString(), detail: real.reason };
  else
    try {
      const d = await graph(
        s,
        `${s.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      );
      result = {
        ok: true,
        at: new Date().toISOString(),
        detail: `Numéro relié : ${d.display_phone_number ?? "?"} (${d.verified_name ?? "nom non vérifié"}), qualité ${d.quality_rating ?? "inconnue"}.`,
      };
    } catch (e) {
      result = {
        ok: false,
        at: new Date().toISOString(),
        detail: explain((e as Error).message),
      };
    }
  await store(actor.id, { ...s, lastTest: result });
  return result;
}

export function explain(message: string) {
  if (message === "TOKEN_MISSING")
    return "Jeton d’accès absent ou illisible : saisissez-le à nouveau.";
  const m = /^GRAPH:(\d+):(.*)$/.exec(message);
  if (!m) return "Meta n’a pas répondu. Réessayez dans un instant.";
  if (m[1] === "190")
    return "Jeton refusé par Meta (expiré ou révoqué). Créez un jeton permanent d’utilisateur système.";
  if (m[1] === "100")
    return "Identifiant du numéro inconnu : copiez le « Phone number ID » affiché dans le tableau de bord WhatsApp de Meta.";
  return "Meta a répondu : " + m[2];
}

/* ---------- Textes des messages ---------- */
const STATUS_TEXT: Record<string, string> = {
  "recu-en-agence": "a bien été reçu à l’agence de Paris",
  expedie: "est parti vers le Congo",
  arrive: "est arrivé au Congo",
  "disponible-au-retrait": "est disponible au retrait",
  remis: "a été remis au destinataire",
  incident: "demande votre attention : merci de contacter l’agence",
};
export function statusMessage(status: string, reference: string, dest: string) {
  const t = STATUS_TEXT[status];
  if (!t) return "";
  const where =
    status === "disponible-au-retrait" ? ` à l’agence de ${dest}` : "";
  return `Express Congo : votre envoi ${reference} ${t}${where}. Suivez-le en direct sur notre site avec votre code de suivi.`;
}
/** Modèle à faire approuver par Meta, avec ses trois variables. */
export const TEMPLATE_BODY =
  "Express Congo : votre envoi {{1}} {{2}}. Destination : {{3}}. Suivez-le en direct sur notre site avec votre code de suivi.";

type Profile = { phone: string; whatsapp: number };

/**
 * Message automatique après une étape du suivi. Simulé (journalisé) tant que
 * la connexion réelle n’est pas active ; jamais bloquant pour l’étape.
 */
export async function notifyStatus(
  shipment: {
    id: string;
    owner: string;
    agency: string;
    payload: Record<string, unknown>;
  },
  status: string,
) {
  try {
    const s = await getWhatsApp();
    if (!s.notify.includes(status)) return;
    const database = await db();
    const profile = await database.get<Profile>(
      "SELECT phone,whatsapp FROM profiles WHERE user_id=?",
      shipment.owner,
    );
    if (!profile?.phone || !profile.whatsapp) return;
    const reference = String(shipment.payload.reference),
      dest = String(shipment.payload.destination);
    const body = statusMessage(status, reference, dest);
    if (!body) return;
    const real = await realConnection();
    let state = "simule",
      wamid = "",
      error = "";
    if (real.ok && s.mode === "cloud" && s.token && s.phoneNumberId)
      try {
        const d = await graph(s, `${s.phoneNumberId}/messages`, {
          method: "POST",
          body: {
            messaging_product: "whatsapp",
            to: profile.phone.replace("+", ""),
            type: "template",
            template: {
              name: s.templateName,
              language: { code: s.templateLanguage },
              components: [
                {
                  type: "body",
                  parameters: [reference, STATUS_TEXT[status], dest].map(
                    (text) => ({ type: "text", text }),
                  ),
                },
              ],
            },
          },
        });
        wamid = String(
          (d.messages as { id: string }[] | undefined)?.[0]?.id ?? "",
        );
        state = "envoye";
      } catch (e) {
        state = "echec";
        error = explain((e as Error).message);
      }
    await record(shipment.owner, shipment.agency, {
      direction: "out",
      phone: profile.phone,
      body,
      status: state,
      shipmentId: shipment.id,
      template: s.templateName,
      wamid,
      error,
    });
  } catch {
    // La notification ne doit jamais empêcher l’enregistrement d’une étape.
  }
}

async function record(
  owner: string,
  agency: string,
  payload: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const id = randomUUID();
  await (
    await db()
  ).run(
    "INSERT INTO entities VALUES(?,?,?,?,1,?,?)",
    id,
    "message",
    owner,
    agency,
    JSON.stringify({ channel: "whatsapp", at: now, ...payload }),
    now,
  );
  return id;
}

/** Réponse libre depuis la gestion (fenêtre de 24 h ouverte par le client). */
export async function reply(
  actor: Actor,
  toOwner: string,
  phoneNumber: string,
  body: string,
) {
  if (!["admin", "manager", "agent"].includes(actor.role))
    throw new Error("ACCESS_DENIED");
  const text = body.trim().slice(0, 1000);
  const to = phone(phoneNumber);
  if (!text || !to || to === "INVALID") throw new Error("INVALID_INPUT");
  const s = await getWhatsApp();
  const real = await realConnection(actor);
  let state = "simule",
    wamid = "",
    error = "";
  if (real.ok && s.mode === "cloud")
    try {
      const d = await graph(s, `${s.phoneNumberId}/messages`, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          to: to.replace("+", ""),
          type: "text",
          text: { body: text },
        },
      });
      wamid = String(
        (d.messages as { id: string }[] | undefined)?.[0]?.id ?? "",
      );
      state = "envoye";
    } catch (e) {
      state = "echec";
      error = explain((e as Error).message);
    }
  await record(toOwner, actor.agency, {
    direction: "out",
    phone: to,
    body: text,
    status: state,
    wamid,
    error,
    author: actor.id,
  });
  return { status: state, error };
}

/* ---------- Webhook Meta ---------- */
export async function verifyWebhook(mode: string | null, token: string | null) {
  const s = await getWhatsApp();
  if (mode !== "subscribe" || !token || !s.verifyToken) return false;
  const a = createHash("sha256").update(token).digest(),
    b = createHash("sha256").update(s.verifyToken).digest();
  return timingSafeEqual(a, b) && (await realConnection()).ok;
}

export async function receiveWebhook(raw: string, signature: string | null) {
  const s = await getWhatsApp();
  const secret = open(s.appSecret);
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(raw).digest("hex"),
  );
  const given = Buffer.from(signature.slice(7));
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return false;
  if (!(await realConnection()).ok) return true;
  const body = JSON.parse(raw) as {
    entry?: { changes?: { value?: Record<string, unknown> }[] }[];
  };
  const database = await db();
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contacts =
        (value.contacts as { wa_id: string; profile?: { name?: string } }[]) ??
        [];
      for (const m of (value.messages as {
        from: string;
        id: string;
        type: string;
        text?: { body: string };
      }[]) ?? []) {
        const from = "+" + m.from;
        const owner = await database.get<{ user_id: string }>(
          "SELECT user_id FROM profiles WHERE phone=?",
          from,
        );
        await record(owner?.user_id ?? "", "paris", {
          direction: "in",
          phone: from,
          name: contacts.find((c) => c.wa_id === m.from)?.profile?.name ?? "",
          body: m.type === "text" ? (m.text?.body ?? "") : `[${m.type}]`,
          status: "recu",
          wamid: m.id,
        });
      }
      for (const st of (value.statuses as { id: string; status: string }[]) ??
        [])
        await database.run(
          "UPDATE entities SET payload=json_set(payload,'$.status',?) WHERE kind='message' AND json_extract(payload,'$.wamid')=?",
          (
            {
              sent: "envoye",
              delivered: "livre",
              read: "lu",
              failed: "echec",
            } as Record<string, string>
          )[st.status] ?? st.status,
          st.id,
        );
    }
  return true;
}

/** Lien « wa.me » avec message prérempli. */
export function waLink(number: string, text: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
