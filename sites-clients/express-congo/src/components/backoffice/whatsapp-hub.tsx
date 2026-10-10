"use client";
import { useEffect, useMemo, useState } from "react";
import type { Entity } from "@/domain/operations";
import type { Person } from "@/server/demo-auth";
import type { WhatsAppView } from "@/server/whatsapp";
import { Illustration } from "@/components/illustrations";
import { date } from "./labels";

/*
 * WhatsApp dans la gestion : conversations avec les clients, puis réglages
 * de connexion du numéro de la gérante (administratrice seulement).
 */
const NOTIFY: [string, string][] = [
  ["recu-en-agence", "Colis reçu à l’agence"],
  ["expedie", "Départ vers le Congo"],
  ["arrive", "Arrivée au Congo"],
  ["disponible-au-retrait", "Disponible au retrait"],
  ["remis", "Remis au destinataire"],
  ["incident", "Incident signalé"],
];
const STATUS: Record<string, string> = {
  simule: "Simulé (démonstration)",
  envoye: "Envoyé",
  livre: "Distribué",
  lu: "Lu",
  echec: "Échec",
  recu: "Reçu",
};
const TEMPLATE =
  "Express Congo : votre envoi {{1}} {{2}}. Destination : {{3}}. Suivez-le en direct sur notre site avec votre code de suivi.";

type Thread = {
  key: string;
  phone: string;
  owner: string;
  name: string;
  items: Entity[];
  last: string;
  unread: number;
};

export function WhatsAppHub({
  messages,
  people,
  isAdmin,
}: {
  messages: Entity[];
  people: Person[];
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<"inbox" | "connect">("inbox");
  const threads = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of messages) {
      const phone = String(m.payload.phone || "");
      const key = phone || m.owner;
      const person = people.find((p) => p.id === m.owner);
      const t = map.get(key) || {
        key,
        phone,
        owner: m.owner,
        name: person?.name || String(m.payload.name || "") || phone,
        items: [],
        last: "",
        unread: 0,
      };
      t.items.push(m);
      if (String(m.payload.at) > t.last) t.last = String(m.payload.at);
      map.set(key, t);
    }
    for (const t of map.values()) {
      t.items.sort((a, b) =>
        String(a.payload.at).localeCompare(String(b.payload.at)),
      );
      // Non lus : messages du client après la dernière réponse de l’agence.
      let n = 0;
      for (const m of t.items) n = m.payload.direction === "in" ? n + 1 : 0;
      t.unread = n;
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last));
  }, [messages, people]);
  const [open, setOpen] = useState(threads[0]?.key ?? "");
  const thread = threads.find((t) => t.key === open);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

  async function send() {
    if (!thread || !draft.trim()) return;
    setSending(true);
    const r = await fetch("/api/demo/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reply",
        owner: thread.owner,
        phone: thread.phone,
        body: draft,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setSending(false);
    if (r.ok) {
      setDraft("");
      location.reload();
    } else setNote(d.message || "Message non envoyé.");
  }

  return (
    <div className="wa">
      <div className="wa-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          className={tab === "inbox" ? "on" : ""}
          onClick={() => setTab("inbox")}
        >
          Conversations
          {threads.some((t) => t.unread) && (
            <span className="count">
              {threads.reduce((s, t) => s + t.unread, 0)}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "connect"}
            className={tab === "connect" ? "on" : ""}
            onClick={() => setTab("connect")}
          >
            Connexion du numéro
          </button>
        )}
      </div>

      {tab === "inbox" &&
        (threads.length ? (
          <div className="wa-inbox">
            <ul className="wa-list" aria-label="Conversations">
              {threads.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    className={t.key === open ? "on" : ""}
                    onClick={() => setOpen(t.key)}
                  >
                    <span className="wa-avatar" aria-hidden>
                      {t.name.slice(0, 1)}
                    </span>
                    <span className="wa-who">
                      <b>{t.name}</b>
                      <small>
                        {String(t.items[t.items.length - 1].payload.body).slice(
                          0,
                          60,
                        )}
                      </small>
                    </span>
                    <span className="wa-when">
                      {date(t.last, "paris", false)}
                      {t.unread > 0 && (
                        <span className="count">{t.unread}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {thread && (
              <section
                className="wa-thread"
                aria-label={"Conversation avec " + thread.name}
              >
                <div className="wa-thread-head">
                  <span className="wa-avatar" aria-hidden>
                    {thread.name.slice(0, 1)}
                  </span>
                  <div>
                    <b>{thread.name}</b>
                    <small>{thread.phone}</small>
                  </div>
                  <a
                    className="button small secondary"
                    href={`https://wa.me/${thread.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir dans WhatsApp
                  </a>
                </div>
                <div className="chat-thread">
                  {thread.items.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "bubble " +
                        (m.payload.direction === "in" ? "them" : "me")
                      }
                    >
                      {m.payload.template ? <em>Message automatique</em> : null}
                      <p>{String(m.payload.body)}</p>
                      <small>
                        {date(m.payload.at)}
                        {m.payload.direction === "out" &&
                          " · " +
                            (STATUS[String(m.payload.status)] ||
                              String(m.payload.status))}
                      </small>
                    </div>
                  ))}
                </div>
                <form
                  className="wa-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <label className="sr-only" htmlFor="wa-draft">
                    Votre réponse
                  </label>
                  <textarea
                    id="wa-draft"
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Écrire une réponse…"
                    maxLength={1000}
                  />
                  <button
                    className="button small whatsapp"
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? "Envoi…" : "Envoyer"}
                  </button>
                </form>
                {note && (
                  <p role="alert" className="notice">
                    {note}
                  </p>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="ch-empty">
            <Illustration name="message" className="ch-empty-art" />
            <p>Aucune conversation pour l’instant.</p>
          </div>
        ))}

      {tab === "connect" && isAdmin && <Connect />}
    </div>
  );
}

function Connect() {
  const [view, setView] = useState<WhatsAppView | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/demo/whatsapp")
      .then((r) => r.json())
      .then((v: WhatsAppView) => {
        setView(v);
        setForm({
          mode: v.mode,
          displayNumber: v.displayNumber,
          greeting: v.greeting,
          phoneNumberId: v.phoneNumberId,
          businessAccountId: v.businessAccountId,
          apiVersion: v.apiVersion,
          templateName: v.templateName,
          templateLanguage: v.templateLanguage,
          notify: v.notify,
        });
      });
  }, []);
  if (!view) return <p className="hint">Chargement des réglages…</p>;
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const notify = (form.notify as string[]) || [];

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setState("");
    const r = await fetch("/api/demo/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setState(d.message || "Réglage non enregistré.");
    if (d.view) setView(d.view);
    setForm((f) => ({ ...f, token: "", appSecret: "" }));
    setState(d.test ? d.test.detail : "Réglages enregistrés.");
  }
  const copy = (t: string) =>
    void navigator.clipboard?.writeText(t).then(() => setState("Copié."));

  return (
    <div className="wa-connect">
      <section className="wa-card">
        <div className="wa-card-head">
          <Illustration name="message" className="wa-art" />
          <div>
            <h2>Le WhatsApp de l’agence</h2>
            <p>
              Le numéro <b>{view.displayNumber}</b> est utilisé pour tous les
              boutons « Écrire sur WhatsApp » du site et de l’espace client.
            </p>
            <p
              className={
                "wa-status " +
                (view.mode === "cloud" && view.lastTest?.ok ? "ok" : "")
              }
            >
              {view.mode === "cloud"
                ? view.lastTest?.ok
                  ? "API WhatsApp reliée : messages automatiques actifs."
                  : "API WhatsApp choisie : test de connexion à faire."
                : "Mode lien direct : aucun compte Meta nécessaire."}
            </p>
          </div>
        </div>
        <div className="wa-modes" role="radiogroup" aria-label="Mode">
          {(
            [
              [
                "lien",
                "Lien direct",
                "Les clients vous écrivent sur votre WhatsApp habituel ; vous répondez depuis votre téléphone.",
              ],
              [
                "cloud",
                "WhatsApp Business Platform",
                "Messages automatiques à chaque étape, conversations reçues et réponses ici, dans la gestion.",
              ],
            ] as const
          ).map(([k, t, d]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={form.mode === k}
              className={form.mode === k ? "on" : ""}
              onClick={() => set("mode", k)}
            >
              <b>{t}</b>
              <span>{d}</span>
            </button>
          ))}
        </div>
        <div className="wa-fields">
          <label>
            Numéro WhatsApp affiché
            <input
              value={String(form.displayNumber ?? "")}
              onChange={(e) => set("displayNumber", e.target.value)}
              inputMode="tel"
            />
          </label>
          <label>
            Début du message prérempli
            <input
              value={String(form.greeting ?? "")}
              onChange={(e) => set("greeting", e.target.value)}
            />
          </label>
        </div>
      </section>

      {form.mode === "cloud" && (
        <section className="wa-card">
          <h3>Relier le numéro à l’API de Meta</h3>
          {!view.realAllowed && <p className="notice">{view.realReason}</p>}
          <ol className="wa-guide">
            <li>
              Dans Meta Business Suite, créez ou ouvrez le compte WhatsApp
              Business de l’entreprise, puis ajoutez le numéro. Un numéro déjà
              utilisé dans l’application WhatsApp Business peut, selon les pays,
              être relié en « coexistence » par un fournisseur agréé de Meta ;
              sinon, utilisez un numéro dédié.
            </li>
            <li>
              Dans l’application Meta pour développeurs, onglet WhatsApp, copiez
              l’« identifiant du numéro de téléphone » et l’« identifiant du
              compte WhatsApp Business ».
            </li>
            <li>
              Créez un utilisateur système et un jeton d’accès permanent avec
              les droits <code>whatsapp_business_messaging</code> et{" "}
              <code>whatsapp_business_management</code>.
            </li>
            <li>
              Faites approuver le modèle de message ci-dessous, en français,
              catégorie « Utilitaire ».
            </li>
            <li>
              Dans « Webhooks », collez l’adresse et le jeton de vérification
              ci-dessous, puis abonnez le champ <code>messages</code>.
            </li>
          </ol>
          <div className="wa-fields">
            <label>
              Identifiant du numéro (Phone number ID)
              <input
                value={String(form.phoneNumberId ?? "")}
                onChange={(e) => set("phoneNumberId", e.target.value)}
                inputMode="numeric"
                disabled={!view.realAllowed}
              />
            </label>
            <label>
              Identifiant du compte WhatsApp Business
              <input
                value={String(form.businessAccountId ?? "")}
                onChange={(e) => set("businessAccountId", e.target.value)}
                inputMode="numeric"
                disabled={!view.realAllowed}
              />
            </label>
            <label>
              Jeton d’accès permanent{" "}
              {view.tokenSet && <em>(enregistré, chiffré)</em>}
              <input
                type="password"
                autoComplete="off"
                value={String(form.token ?? "")}
                onChange={(e) => set("token", e.target.value)}
                placeholder={
                  view.tokenSet ? "Laisser vide pour garder l’actuel" : ""
                }
                disabled={!view.realAllowed}
              />
            </label>
            <label>
              Clé secrète de l’application Meta{" "}
              {view.appSecretSet && <em>(enregistrée, chiffrée)</em>}
              <input
                type="password"
                autoComplete="off"
                value={String(form.appSecret ?? "")}
                onChange={(e) => set("appSecret", e.target.value)}
                placeholder={
                  view.appSecretSet ? "Laisser vide pour garder l’actuelle" : ""
                }
                disabled={!view.realAllowed}
              />
            </label>
            <label>
              Nom du modèle approuvé
              <input
                value={String(form.templateName ?? "")}
                onChange={(e) => set("templateName", e.target.value)}
              />
            </label>
            <label>
              Langue du modèle
              <input
                value={String(form.templateLanguage ?? "")}
                onChange={(e) => set("templateLanguage", e.target.value)}
              />
            </label>
          </div>
          <div className="wa-copy">
            <div>
              <span>Adresse du webhook</span>
              <code>{view.webhookUrl}</code>
              <button
                type="button"
                className="text-button"
                onClick={() => copy(view.webhookUrl)}
              >
                Copier
              </button>
            </div>
            <div>
              <span>Jeton de vérification</span>
              <code>{view.verifyToken || "créé à l’enregistrement"}</code>
              {view.verifyToken && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => copy(view.verifyToken)}
                >
                  Copier
                </button>
              )}
            </div>
            <div>
              <span>Modèle à faire approuver</span>
              <code>{TEMPLATE}</code>
              <button
                type="button"
                className="text-button"
                onClick={() => copy(TEMPLATE)}
              >
                Copier
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="wa-card">
        <h3>Messages automatiques au client</h3>
        <p className="hint">
          Envoyés à chaque étape cochée, aux clients qui ont accepté WhatsApp.
          Tant que l’API n’est pas reliée, ils sont simulés et visibles dans les
          conversations.
        </p>
        <div className="wa-switches">
          {NOTIFY.map(([k, l]) => (
            <label key={k} className="switch-line">
              <input
                type="checkbox"
                checked={notify.includes(k)}
                onChange={(e) =>
                  set(
                    "notify",
                    e.target.checked
                      ? [...notify, k]
                      : notify.filter((x) => x !== k),
                  )
                }
              />
              <span>{l}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="wa-save">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void post(form)}
        >
          Enregistrer
        </button>
        {form.mode === "cloud" && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || !view.tokenSet}
            onClick={() => void post({ action: "test" })}
          >
            Tester la connexion
          </button>
        )}
        {view.lastTest && (
          <span className={"wa-test " + (view.lastTest.ok ? "ok" : "bad")}>
            Dernier test, {date(view.lastTest.at)} : {view.lastTest.detail}
          </span>
        )}
        {state && (
          <span role="status" className="wa-state">
            {state}
          </span>
        )}
      </div>
    </div>
  );
}
