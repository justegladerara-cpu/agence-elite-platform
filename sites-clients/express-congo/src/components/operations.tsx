"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { Actor, Entity } from "@/domain/operations";
import { shipmentStates } from "@/domain/operations";
import type { demoAccounts, Person, Mailbox } from "@/server/demo-auth";
import type { QuoteView, AuditView } from "@/server/backoffice";
import {
  states,
  stateLabel,
  roles,
  agencies,
  services,
  pipeline,
  quoteNext,
  actions,
  shortRef,
  date,
  measures,
  money,
  parcelVolume,
  parcelWeight,
  fr,
} from "./backoffice/labels";
import { HBars, Columns } from "./backoffice/charts";
import { pricedLines } from "@/content/tariffs";
import { PaymentHub } from "./backoffice/payment-hub";
import { ClientHome } from "./backoffice/client-home";
import { WhatsAppHub } from "./backoffice/whatsapp-hub";
import { useRouter } from "next/navigation";
import { Illustration } from "./illustrations";
import type {
  PayInstruction,
  PaymentSettings,
  Provider,
} from "@/server/payments";

type Accounts = readonly (typeof demoAccounts)[number][];
const errors: Record<string, string> = {
  ACCESS_DENIED: "Votre rôle ne permet pas cette opération.",
  INVALID_TRANSITION:
    "Ce changement d’état n’est pas possible depuis l’état actuel.",
  REVIEW_REQUIRED:
    "Validez d’abord l’écart de mesures du colis avant de l’affecter.",
  ASSIGNMENT_CONFLICT:
    "Cette expédition est déjà affectée ou ne correspond pas à ce départ.",
  WITHDRAWAL_PROOF_REQUIRED:
    "Confirmez le droit de retrait et renseignez la preuve avant la remise.",
  INVALID_MEASUREMENTS: "Vérifiez les dimensions et les poids saisis.",
  INVALID_INPUT: "Vérifiez les valeurs saisies.",
  INVALID_OWNER: "Choisissez un client vérifié.",
  INVALID_LINES:
    "Vérifiez chaque ligne : libellé, quantité entière et prix unitaire.",
  TRANSFER_REFUSED:
    "Transfert impossible : même agence, dossier clos, ou expédition déjà partie et pas encore arrivée.",
  CONFLICT:
    "Le dossier a été modifié entre-temps. Rechargez la page puis recommencez.",
  PROPOSAL_NOT_ACCEPTED:
    "Un encaissement ne s’enregistre que sur une proposition acceptée.",
  INVALID_AMOUNT: "Saisissez un montant positif (125,50 en euros).",
  METHOD_DISABLED:
    "Ce moyen de paiement n’est pas activé dans le hub de paiement.",
  PAYMENT_EXCEEDS:
    "Ce montant dépasse le reste à encaisser sur cette proposition.",
};

function Pill({ value }: { value: unknown }) {
  const [label, tone] = states[String(value)] || [String(value ?? "—"), ""];
  return <span className={"pill " + tone}>{label}</span>;
}

/* ---------- Actions guidées ---------- */
type Field = {
  name: string;
  label: string;
  type?: string;
  value?: string;
  optional?: boolean;
  group?: string;
  options?: { value: string; label: string }[];
};
type Task = {
  key: string;
  title: string;
  hint: string;
  command: string;
  fields: Field[];
};
const pick = (name: string, label: string, items: Entity[]): Field => ({
  name,
  label,
  options: items.map((i) => ({
    value: i.id,
    label: [
      shortRef(i.payload.reference || i.payload.number || i.payload.subject),
      services[String(i.payload.service || i.payload.mode)] || "",
      i.kind === "departure"
        ? `${agencies[i.agency]} · ${date(i.payload.confirmedAt || i.payload.scheduledAt, i.agency)}`
        : "",
      i.payload.status ? stateLabel(i.payload.status) : "",
    ]
      .filter(Boolean)
      .join(" — "),
  })),
});
function groups(fields: Field[]) {
  const out: [string, Field[]][] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (last && last[0] === (f.group || "")) last[1].push(f);
    else out.push([f.group || "", [f]]);
  }
  return out;
}
/* Lignes de proposition : libellé, quantité, prix unitaire, total calculé. */
type Line = { label: string; quantity: string; unit: string };
const blankLine = (): Line => ({ label: "", quantity: "1", unit: "" });
function LinesField({ id }: { id: string }) {
  const [currency, setCurrency] = useState("EUR"),
    [lines, setLines] = useState<Line[]>([
      { label: "Transport France → Congo", quantity: "1", unit: "" },
    ]);
  const places = currency === "EUR" ? 2 : 0;
  const minor = (v: string) => {
    const t = v.trim().replace(/\s/g, "");
    const ok = places === 0 ? /^\d{1,12}$/ : /^\d{1,10}([.,]\d{1,2})?$/;
    if (!ok.test(t)) return null;
    const [w, f = ""] = t.split(/[.,]/);
    return Number(w + f.padEnd(places, "0"));
  };
  // Quantité en millièmes : les kilos peuvent être décimaux (23,5).
  const qty = (v: string) => {
    const t = v.trim().replace(/\s/g, "");
    if (!/^\d{1,5}([.,]\d{1,3})?$/.test(t)) return null;
    const [w, f = ""] = t.split(/[.,]/);
    const n = Number(w) * 1000 + Number(f.padEnd(3, "0"));
    return n > 0 ? n : null;
  };
  const lineTotal = (l: Line) => {
    const u = minor(l.unit),
      q = qty(l.quantity);
    return u !== null && q !== null ? Math.round((u * q) / 1000) : null;
  };
  const addTariff = (key: string) => {
    const t = pricedLines.find((x) => x.key === key);
    if (!t || lines.length >= 20) return;
    const unit = String(t.priceMinor / 100).replace(".", ",");
    const line = {
      label: t.label + (t.unit === "kg" ? " (au kg)" : ""),
      quantity: "1",
      unit,
    };
    // Remplace la ligne vide de départ plutôt que d’en ajouter une.
    const blank = lines.findIndex((l) => !l.unit.trim());
    setLines(
      blank >= 0
        ? lines.map((l, i) => (i === blank ? line : l))
        : [...lines, line],
    );
  };
  const total = lines.reduce((s, l) => s + (lineTotal(l) ?? 0), 0);
  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <fieldset className="lines-field" id={id}>
      <legend>Détail chiffré</legend>
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="lines-head">
        <label>
          Devise
          <select
            aria-label="Devise"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="EUR">Euro (EUR)</option>
            <option value="XAF">Franc CFA (XAF)</option>
          </select>
        </label>
        <p className="hint">
          {places
            ? "Prix unitaires en euros, centimes après la virgule (125,50)."
            : "Prix unitaires en francs CFA, sans décimale (15000)."}
        </p>
      </div>
      <div className="lines-table" role="table" aria-label="Lignes">
        <div className="lines-row lines-row-head" role="row">
          <span role="columnheader">Prestation</span>
          <span role="columnheader">Qté</span>
          <span role="columnheader">Prix unitaire</span>
          <span role="columnheader">Total</span>
          <span />
        </div>
        {lines.map((l, i) => {
          const t = lineTotal(l);
          return (
            <div className="lines-row" role="row" key={i}>
              <input
                aria-label={`Prestation ${i + 1}`}
                value={l.label}
                maxLength={160}
                required
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <input
                aria-label={`Quantité ${i + 1}`}
                value={l.quantity}
                inputMode="decimal"
                required
                onChange={(e) => set(i, { quantity: e.target.value })}
              />
              <input
                aria-label={`Prix unitaire ${i + 1}`}
                value={l.unit}
                inputMode="decimal"
                required
                onChange={(e) => set(i, { unit: e.target.value })}
              />
              <output className={t === null && l.unit ? "bad" : ""}>
                {t === null ? (l.unit ? "Invalide" : "—") : money(t, currency)}
              </output>
              <button
                type="button"
                className="icon-button"
                aria-label={`Retirer la ligne ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="lines-foot">
        <div className="lines-add">
          <button
            type="button"
            className="text-button"
            disabled={lines.length >= 20}
            onClick={() => setLines([...lines, blankLine()])}
          >
            + Ajouter une ligne
          </button>
          {currency === "EUR" && (
            <select
              aria-label="Ajouter un tarif de la grille"
              value=""
              onChange={(e) => addTariff(e.target.value)}
            >
              <option value="">+ Tarif de la grille…</option>
              {pricedLines.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="lines-total">
          Total <b>{money(total, currency)}</b>
        </p>
      </div>
    </fieldset>
  );
}

function TaskForm({
  task,
  preset,
  run,
  close,
}: {
  task: Task;
  preset: Record<string, string>;
  run: (command: string, input: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const renderField = (f: Field) =>
    f.type === "lines" ? (
      <LinesField key={f.name} id={`${task.key}-${f.name}`} />
    ) : (
      <label key={f.name} htmlFor={`${task.key}-${f.name}`}>
        {f.label}
        {f.optional ? " (facultatif)" : ""}
        {f.options ? (
          <select
            id={`${task.key}-${f.name}`}
            name={f.name}
            defaultValue={preset[f.name] ?? f.value}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${task.key}-${f.name}`}
            name={f.name}
            type={!f.type || f.type === "decimal" ? "text" : f.type}
            defaultValue={preset[f.name] ?? f.value}
            inputMode={f.type === "decimal" ? "decimal" : undefined}
            required={!f.optional}
          />
        )}
      </label>
    );
  return (
    <form
      className="task-panel"
      aria-labelledby={"task-" + task.key}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await run(
          task.command,
          Object.fromEntries(new FormData(e.currentTarget)),
        );
        setBusy(false);
        if (ok) close();
      }}
    >
      <h2 id={"task-" + task.key}>{task.title}</h2>
      <p className="hint">{task.hint}</p>
      {groups(task.fields).map(([group, fields]) =>
        fields[0].type === "lines" ? (
          renderField(fields[0])
        ) : group ? (
          <fieldset className="measure-group" key={group}>
            <legend>{group}</legend>
            <div className="fields four">{fields.map(renderField)}</div>
          </fieldset>
        ) : (
          <div className="fields" key={fields[0].name}>
            {fields.map(renderField)}
          </div>
        ),
      )}
      <div className="actions">
        <button className="button" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="text-button" onClick={close}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/* ---------- Connexion et comptes ---------- */
type Mode = "demo" | "account" | "register" | "forgot" | "reset";
async function accountCall(body: Record<string, string>) {
  const r = await fetch("/api/demo/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as {
    message?: string;
    mailbox?: Mailbox | null;
  };
  return { ok: r.ok, ...data };
}
function SimulatedMail({ mail }: { mail: Mailbox }) {
  return (
    <div className="mail-sim" role="status">
      <p className="mail-sim-flag">
        Simulation — aucun email n’est envoyé en démonstration
      </p>
      <dl>
        <div>
          <dt>À</dt>
          <dd>{mail.to}</dd>
        </div>
        <div>
          <dt>Objet</dt>
          <dd>{mail.subject}</dd>
        </div>
      </dl>
      <p>{mail.body}</p>
      <a className="button small" href={mail.link}>
        Ouvrir le lien du message
      </a>
    </div>
  );
}
function Login({ accounts, code }: { accounts: Accounts; code: string }) {
  const demoOpen = accounts.length > 0;
  const [mode, setMode] = useState<Mode>(demoOpen ? "demo" : "account"),
    [email, setEmail] = useState("client-a@example.invalid"),
    [ownEmail, setOwnEmail] = useState(""),
    [password, setPassword] = useState(""),
    [factor, setFactor] = useState(""),
    [agency, setAgency] = useState("paris"),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
      null,
    ),
    [mail, setMail] = useState<Mailbox | null>(null);

  /* Liens reçus par message : confirmation ou réinitialisation. */
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const verify = q.get("verifier"),
      reset = q.get("reinitialiser"),
      sso = q.get("sso");
    if (!verify && !reset && !sso) return;
    history.replaceState(null, "", "/demo/");
    // Ouverture depuis la plateforme Agence Élite (lien valable 60 secondes).
    if (sso) {
      fetch("/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sso }),
      }).then(async (r) => {
        if (r.ok) location.reload();
        else {
          setMode("account");
          setMessage({
            text: "Ce lien d’accès a expiré ou a déjà servi. Rouvrez la gestion depuis la plateforme.",
            ok: false,
          });
        }
      });
      return;
    }
    // Mise à jour différée d’un tour : l’URL n’est lisible qu’après hydratation.
    if (reset) {
      void Promise.resolve().then(() => {
        setToken(reset);
        setMode("reset");
      });
      return;
    }
    accountCall({ action: "verify", token: verify! }).then((r) => {
      setMode("account");
      setMessage({ text: r.message || "Lien invalide.", ok: r.ok });
    });
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setMessage(null);
    setMail(null);
    setPassword("");
  };
  async function signIn(address: string) {
    const r = await fetch("/api/demo/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, password, code: factor }),
    });
    if (r.ok) location.reload();
    else
      setMessage({
        text:
          mode === "demo"
            ? "Connexion refusée. Vérifiez le compte, le mot de passe et le code administrateur."
            : "Connexion refusée. Vérifiez votre email et votre mot de passe, et que votre adresse est bien confirmée.",
        ok: false,
      });
  }
  /* Entrée en un clic : mot de passe et code simulé sont publics en démonstration. */
  async function quick(address: string) {
    setBusy(true);
    setMessage(null);
    const s = await fetch("/api/demo/session")
      .then((r) => r.json())
      .catch(() => ({}));
    const r = await fetch("/api/demo/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: address,
        password: "DemoExpress!2026",
        code: s.secondStep,
      }),
    });
    if (r.ok) location.reload();
    else {
      setBusy(false);
      setMessage({ text: "Connexion refusée. Réessayez.", ok: false });
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setMail(null);
    if (mode === "demo") await signIn(email);
    else if (mode === "account") await signIn(ownEmail);
    else {
      const r = await accountCall(
        mode === "register"
          ? { action: "register", email: ownEmail, password, agency }
          : mode === "forgot"
            ? { action: "forgot", email: ownEmail }
            : { action: "reset", token, password },
      );
      setMessage({ text: r.message || "Erreur.", ok: r.ok });
      if (r.mailbox) setMail(r.mailbox);
      if (r.ok && mode === "reset") {
        setMode("account");
        setPassword("");
      }
    }
    setBusy(false);
  }
  const titles: Record<Mode, [string, string]> = {
    demo: ["Connexion", "Se connecter à la démonstration"],
    account: ["Mon espace client", "Se connecter"],
    register: ["Créer un espace client", "Créer mon compte"],
    forgot: ["Mot de passe oublié", "Recevoir un lien"],
    reset: ["Nouveau mot de passe", "Enregistrer le mot de passe"],
  };
  return (
    <div className="app-shell login-shell">
      <aside className="login-brand">
        <div className="app-brand">
          <Image
            src="/assets/logo-expresscongo.png"
            alt="Express Congo"
            width={511}
            height={80}
          />
        </div>
        <div className="login-pitch">
          <p className="eyebrow">Paris · Brazzaville · Pointe-Noire</p>
          <h1>Vos envois, suivis de bout en bout.</h1>
          <p>
            Demandes, colis, départs, propositions et remises réunis dans un
            seul espace, pour les clients comme pour les agences.
          </p>
          <Illustration name="suivi" className="login-art" />
          <ul className="login-points">
            <li>Suivi en direct de chaque expédition</li>
            <li>Propositions détaillées acceptées en ligne</li>
            <li>WhatsApp relié à la gestion</li>
          </ul>
        </div>
        {demoOpen && (
          <span className="demo-flag">Démonstration — dossiers fictifs</span>
        )}
      </aside>
      <div className="login-panel">
        {demoOpen && (mode === "demo" || mode === "account") && (
          <div className="segmented" role="tablist" aria-label="Type d’accès">
            {(
              [
                ["account", "Mon compte"],
                ["demo", "Comptes de démonstration"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => switchTo(m)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === "demo" && accounts.length > 0 && (
          <div className="quick-login" aria-label="Entrer en un clic">
            {(
              [
                [
                  "client-a@example.invalid",
                  "Entrer comme cliente",
                  "Mireille Bouanga, 6 envois en cours et terminés",
                  "famille",
                ],
                [
                  "admin@example.invalid",
                  "Entrer comme gérante",
                  "Administration complète, WhatsApp et paiements",
                  "agence",
                ],
                [
                  "agent-brazzaville@example.invalid",
                  "Entrer comme agent",
                  "Agence de Brazzaville, arrivées et remises",
                  "remise",
                ],
              ] as const
            )
              .filter(([e]) => accounts.some((a) => a.email === e))
              .map(([address, title, hint, art]) => (
                <button
                  key={address}
                  type="button"
                  className="quick-card"
                  disabled={busy}
                  onClick={() => void quick(address)}
                >
                  <Illustration name={art} animated={false} />
                  <b>{title}</b>
                  <span>{hint}</span>
                </button>
              ))}
          </div>
        )}
        <form className="login-form" onSubmit={submit}>
          <h2>{titles[mode][0]}</h2>
          {mode === "demo" && (
            <>
              <p className="hint">
                Mot de passe des comptes de démonstration :{" "}
                <code>DemoExpress!2026</code>. Code administrateur simulé :{" "}
                <strong>{code}</strong> (valable 30 secondes, actualisez la page
                s’il a expiré).
              </p>
              <label>
                Compte
                <select
                  aria-label="Compte"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.email}>
                      {roles[a.role].charAt(0).toUpperCase() +
                        roles[a.role].slice(1)}{" "}
                      — {agencies[a.agency]} ({a.email})
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {mode !== "demo" && mode !== "reset" && (
            <label>
              Adresse email
              <input
                type="email"
                value={ownEmail}
                onChange={(e) => setOwnEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              {mode === "register" || mode === "reset"
                ? "Mot de passe (10 caractères minimum, lettres et chiffres)"
                : "Mot de passe"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "register" || mode === "reset"
                    ? "new-password"
                    : "current-password"
                }
                minLength={mode === "register" || mode === "reset" ? 10 : 1}
                required
              />
            </label>
          )}
          {mode === "register" && (
            <label>
              Agence de rattachement
              <select
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
              >
                {Object.entries(agencies).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "demo" && (
            <label>
              Code administrateur (simulation)
              <input
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                inputMode="numeric"
              />
            </label>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Un instant…" : titles[mode][1]}
          </button>
          {message && (
            <p role="alert" className={message.ok ? "success" : "error"}>
              {message.text}
            </p>
          )}
          {mail && <SimulatedMail mail={mail} />}
          <div className="login-links">
            {mode === "account" && (
              <>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchTo("register")}
                >
                  Créer un espace client
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchTo("forgot")}
                >
                  Mot de passe oublié ?
                </button>
              </>
            )}
            {["register", "forgot", "reset"].includes(mode) && (
              <button
                type="button"
                className="text-button"
                onClick={() => switchTo("account")}
              >
                ← Retour à la connexion
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Suivi public et affectation groupée ---------- */
function TrackingCard({
  reference,
  code,
}: {
  reference: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = `/suivi/?ref=${encodeURIComponent(reference)}&code=${code}`;
  return (
    <div className="tracking-card">
      <div>
        <span className="eyebrow">Code de suivi public</span>
        <b className="tracking-code">{code}</b>
        <small>
          À communiquer avec la référence : il permet de consulter les étapes,
          sans aucune donnée personnelle.
        </small>
      </div>
      <div className="tracking-actions">
        <a className="button small secondary" href={url} target="_blank">
          Ouvrir le suivi
        </a>
        <button
          type="button"
          className="text-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `Référence : ${reference}\nCode de suivi : ${code}\n${location.origin}${url}`,
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copié ✓" : "Copier pour le client"}
        </button>
      </div>
    </div>
  );
}

function BulkAssign({
  departure,
  candidates,
}: {
  departure: Entity;
  candidates: Entity[];
}) {
  const [chosen, setChosen] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<{ ref: string; ok: boolean; why: string }[]>(
      [],
    );
  if (!candidates.length && !report.length) return null;
  async function assign() {
    setBusy(true);
    const out: typeof report = [];
    // Une commande par expédition : chaque refus est expliqué sans bloquer les autres.
    for (const id of chosen) {
      const ship = candidates.find((c) => c.id === id)!;
      const r = await fetch("/api/demo/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "assignDeparture",
          departureId: departure.id,
          shipmentId: id,
        }),
      });
      const data = r.ok ? {} : await r.json().catch(() => ({}));
      out.push({
        ref: shortRef(ship.payload.reference),
        ok: r.ok,
        why: r.ok ? "Affectée" : errors[data.message] || "Refusée",
      });
    }
    setReport(out);
    setChosen([]);
    setBusy(false);
  }
  return (
    <div className="bulk">
      <h3>Affecter plusieurs expéditions</h3>
      {candidates.length > 0 && (
        <>
          <p className="hint">
            Expéditions de la même agence et du même mode, pas encore affectées.
          </p>
          <ul className="check-list">
            {candidates.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(ev) =>
                      setChosen(
                        ev.target.checked
                          ? [...chosen, c.id]
                          : chosen.filter((x) => x !== c.id),
                      )
                    }
                  />
                  <span className="ref">{shortRef(c.payload.reference)}</span>
                  <span>
                    {String(c.payload.destination)} ·{" "}
                    {stateLabel(c.payload.status)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="drawer-actions">
            <button
              type="button"
              className="button small"
              disabled={!chosen.length || busy}
              onClick={assign}
            >
              {busy
                ? "Affectation…"
                : chosen.length
                  ? `Affecter ${chosen.length} expédition${chosen.length > 1 ? "s" : ""}`
                  : "Sélectionnez des expéditions"}
            </button>
          </div>
        </>
      )}
      {report.length > 0 && (
        <div className="bulk-report" role="status">
          <ul>
            {report.map((r) => (
              <li key={r.ref} className={r.ok ? "ok" : "bad"}>
                <span className="ref">{r.ref}</span> — {r.why}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-button"
            onClick={() => location.reload()}
          >
            Actualiser la fiche
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Lignes de tableau ---------- */
type Row = {
  id: string;
  kind: string;
  status?: string;
  agency: string;
  at: string;
  text: string;
  cells: React.ReactNode[];
  csv: string[];
};
function download(name: string, head: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const body = [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Operations({
  actor,
  entities,
  accounts,
  people = [],
  payInstructions = [],
  hub = null,
  code,
  quotes = [],
  audit = [],
  whatsapp = "+33621933298",
}: {
  actor: Actor | null;
  entities: Entity[];
  accounts: Accounts;
  people?: Person[];
  payInstructions?: PayInstruction[];
  hub?: { settings: PaymentSettings; providers: Provider[] } | null;
  code: string;
  quotes?: QuoteView[];
  audit?: AuditView[];
  whatsapp?: string;
}) {
  const staff = !!actor && actor.role !== "client";
  const [view, setView] = useState(staff ? "dashboard" : "home"),
    [task, setTask] = useState(""),
    [preset, setPreset] = useState<Record<string, string>>({}),
    [search, setSearch] = useState(""),
    [stateFilter, setStateFilter] = useState(""),
    [agencyFilter, setAgencyFilter] = useState(""),
    [oldestFirst, setOldestFirst] = useState(false),
    [detail, setDetail] = useState<{ kind: string; id: string } | null>(null),
    [message, setMessage] = useState(""),
    [resetting, setResetting] = useState(false);
  const router = useRouter();
  /* En direct : les données se rechargent toutes les 10 s, sauf pendant une saisie. */
  useEffect(() => {
    if (!actor) return;
    const id = setInterval(() => {
      const el = document.activeElement;
      const typing = el?.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if (document.visibilityState === "visible" && !typing && !task)
        router.refresh();
    }, 10000);
    return () => clearInterval(id);
  }, [actor, router, task]);
  if (!actor) return <Login accounts={accounts} code={code} />;

  async function run(command: string, input: Record<string, unknown>) {
    if (command === "receiveParcel") {
      const declared = {
        length: String(input.length),
        width: String(input.width),
        height: String(input.height),
        weight: String(input.weight),
        quantity: String(input.quantity),
        unit: "cm",
      };
      const controlled = {
        ...declared,
        length: String(input.controlledLength || input.length),
        width: String(input.controlledWidth || input.width),
        height: String(input.controlledHeight || input.height),
        weight: String(input.controlledWeight),
      };
      input = { ...input, declared, controlled };
    }
    if (command === "event")
      input = {
        ...input,
        entitlementConfirmed: input.entitlementConfirmed === "oui",
      };
    const r = await fetch("/api/demo/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, ...input }),
    });
    if (r.ok) {
      location.reload();
      return true;
    }
    const data = await r.json().catch(() => ({}));
    setMessage(
      errors[data.message] || "L’opération n’a pas pu être enregistrée.",
    );
    return false;
  }

  /* Données dérivées, toutes issues des dossiers visibles par ce rôle. */
  const of = (kind: string) => entities.filter((e) => e.kind === kind);
  const shipments = of("shipment"),
    parcels = of("parcel"),
    departures = of("departure"),
    proposals = of("proposal"),
    events = of("event"),
    tickets = of("ticket"),
    payments = of("payment");
  /* Encaissé sur une proposition, en unités mineures. */
  const paidFor = (id: string) =>
    payments
      .filter((x) => x.payload.proposalId === id)
      .reduce((sum, x) => sum + Number(x.payload.amountMinor), 0);
  const payState = (pr: Entity) => {
    if (pr.payload.status !== "acceptee") return "";
    const paid = paidFor(pr.id),
      total = Number(pr.payload.totalMinor);
    return paid >= total ? "payee" : paid > 0 ? "partiel" : "a-payer";
  };
  const methodNames: Record<string, string> = {
    transfer: "Virement bancaire",
    mtn: "MTN Mobile Money",
    airtel: "Airtel Money",
    cash: "Espèces en agence",
  };
  const email = (id: string) => {
    const p = people.find((a) => a.id === id);
    return p ? p.name || p.email : "—";
  };
  const clientAccounts = people.filter((a) => a.role === "client");
  const clients = clientAccounts.map((a) => ({
    value: a.id,
    label: a.name ? `${a.name} (${a.email})` : a.email,
  }));
  const myAgencies = Object.entries(agencies)
    .filter(([k]) => actor.role === "admin" || k === actor.agency)
    .map(([value, label]) => ({ value, label }));
  const can = (...r: string[]) => r.includes(actor.role);
  const byShipment = (list: Entity[], id: string) =>
    list.filter((e) => e.payload.shipmentId === id);
  const active = shipments.filter(
    (s) => !["remis", "annule"].includes(String(s.payload.status)),
  );
  const toReview = parcels.filter(
    (p) => p.payload.priceReviewRequired && !p.payload.priceReviewApproved,
  );
  const incidents = shipments.filter((s) => s.payload.status === "incident");
  const ready = shipments.filter(
    (s) => s.payload.status === "disponible-au-retrait",
  );
  const quotesToHandle = quotes.filter((q) =>
    ["nouveau", "a-completer"].includes(q.status),
  );
  const openTickets = tickets.filter((t) => t.payload.status === "nouveau");

  /* ---------- Actions ---------- */
  const tasks = (
    [
      can("admin", "manager", "agent") && {
        key: "newShipment",
        title: "Ouvrir une expédition",
        hint: "Crée le dossier d’un client vérifié, avant la réception de ses colis.",
        command: "newShipment",
        fields: [
          { name: "owner", label: "Client", options: clients },
          { name: "agency", label: "Agence responsable", options: myAgencies },
          {
            name: "service",
            label: "Service",
            options: ["aerien", "maritime", "conteneur"].map((value) => ({
              value,
              label: services[value],
            })),
          },
          {
            name: "destination",
            label: "Destination",
            options: ["Brazzaville", "Pointe-Noire"].map((v) => ({
              value: v,
              label: v,
            })),
          },
        ],
      },
      can("admin", "manager", "agent") &&
        shipments.length > 0 && {
          key: "receiveParcel",
          title: "Réceptionner un colis",
          hint: "Saisissez les mesures déclarées par le client puis celles relevées au comptoir. Un écart bloque l’affectation jusqu’à validation.",
          command: "receiveParcel",
          fields: [
            pick("shipmentId", "Expédition", shipments),
            { name: "description", label: "Contenu" },
            ...(
              [
                ["length", "Longueur (cm)"],
                ["width", "Largeur (cm)"],
                ["height", "Hauteur (cm)"],
                ["weight", "Poids (kg)"],
              ] as const
            ).map(([name, label]) => ({
              name,
              label,
              type: "decimal",
              group: "Déclaré par le client",
            })),
            ...(
              [
                ["controlledLength", "Longueur (cm)", true],
                ["controlledWidth", "Largeur (cm)", true],
                ["controlledHeight", "Hauteur (cm)", true],
                ["controlledWeight", "Poids pesé (kg)", false],
              ] as const
            ).map(([name, label, optional]) => ({
              name,
              label,
              type: "decimal",
              optional,
              group: "Mesuré au comptoir",
            })),
            { name: "quantity", label: "Nombre de colis", value: "1" },
            {
              name: "reserves",
              label: "État et réserves",
              value: "Aucune réserve",
            },
          ],
        },
      can("admin", "manager") &&
        toReview.length > 0 && {
          key: "approveMeasures",
          title: "Valider un écart de mesures",
          hint: "L’accord est tracé avec son motif dans l’historique du colis.",
          command: "approveMeasures",
          fields: [
            pick("parcelId", "Colis à valider", toReview),
            { name: "reason", label: "Motif de l’accord" },
          ],
        },
      can("admin", "manager", "agent") &&
        shipments.length > 0 && {
          key: "event",
          title: "Mettre à jour le suivi",
          hint: "Chaque mise à jour s’ajoute à l’historique ; rien n’est effacé.",
          command: "event",
          fields: [
            pick("shipmentId", "Expédition", shipments),
            {
              name: "status",
              label: "Nouvel état",
              options: shipmentStates.map((value) => ({
                value,
                label: stateLabel(value),
              })),
            },
            { name: "location", label: "Lieu" },
            {
              name: "reason",
              label: "Commentaire",
              value: "Mise à jour agence",
            },
            {
              name: "entitlementConfirmed",
              label: "Droit de retrait contrôlé (remise)",
              options: [
                { value: "non", label: "Non concerné" },
                { value: "oui", label: "Oui, pièce contrôlée" },
              ],
            },
            {
              name: "proof",
              label: "Preuve de remise",
              value: "Non applicable",
            },
          ],
        },
      can("admin", "manager", "agent") && {
        key: "newDeparture",
        title: "Programmer un départ",
        hint: "La date reste prévisionnelle tant qu’elle n’est pas confirmée.",
        command: "newDeparture",
        fields: [
          { name: "agency", label: "Agence", options: myAgencies },
          {
            name: "mode",
            label: "Mode",
            options: [
              { value: "aerien", label: "Fret aérien" },
              { value: "maritime", label: "Fret maritime" },
            ],
          },
          {
            name: "scheduledAt",
            label: "Date prévisionnelle (UTC)",
            type: "datetime-local",
          },
        ],
      },
      can("admin", "manager", "agent") &&
        shipments.length > 0 &&
        departures.length > 0 && {
          key: "assignDeparture",
          title: "Affecter à un départ",
          hint: "L’expédition doit avoir le même mode et la même agence que le départ.",
          command: "assignDeparture",
          fields: [
            pick("shipmentId", "Expédition", shipments),
            pick("departureId", "Départ", departures),
          ],
        },
      can("admin", "sales") &&
        shipments.length > 0 && {
          key: "proposal",
          title: "Envoyer une proposition",
          hint: "Détaillez les prestations ligne par ligne : le total est calculé automatiquement, sans arrondi caché.",
          command: "proposal",
          fields: [
            pick("shipmentId", "Expédition", shipments),
            { name: "lines", label: "Détail", type: "lines", group: "lignes" },
            {
              name: "exclusions",
              label: "Conditions, inclusions et exclusions",
            },
            { name: "validUntil", label: "Valable jusqu’au", type: "date" },
          ],
        },
      can("admin", "manager", "agent") &&
        departures.some((d) => d.payload.status !== "confirme") && {
          key: "confirmDeparture",
          title: "Confirmer un départ",
          hint: "La date confirmée remplace la date prévisionnelle pour les clients et le suivi public.",
          command: "confirmDeparture",
          fields: [
            pick(
              "departureId",
              "Départ",
              departures.filter((d) => d.payload.status !== "confirme"),
            ),
            {
              name: "confirmedAt",
              label: "Date et heure confirmées (UTC)",
              type: "datetime-local",
            },
          ],
        },
      can("admin", "manager") &&
        shipments.length > 0 && {
          key: "transferShipment",
          title: "Transférer une expédition",
          hint: "Confie le dossier, ses colis et son historique à une autre agence, par exemple à l’arrivée au Congo.",
          command: "transferShipment",
          fields: [
            pick(
              "shipmentId",
              "Expédition",
              shipments.filter(
                (x) => !["remis", "annule"].includes(String(x.payload.status)),
              ),
            ),
            {
              name: "agency",
              label: "Nouvelle agence",
              options: Object.entries(agencies).map(([value, label]) => ({
                value,
                label,
              })),
            },
            { name: "reason", label: "Motif du transfert" },
          ],
        },
      can("admin", "finance") &&
        proposals.some((x) => payState(x) && payState(x) !== "payee") && {
          key: "recordPayment",
          title: "Enregistrer un encaissement",
          hint: "Saisissez le montant effectivement reçu ; il ne peut pas dépasser le reste à encaisser.",
          command: "recordPayment",
          fields: [
            pick(
              "proposalId",
              "Proposition acceptée",
              proposals.filter((x) => payState(x) && payState(x) !== "payee"),
            ),
            { name: "amount", label: "Montant reçu", type: "decimal" },
            {
              name: "method",
              label: "Moyen",
              options: payInstructions.filter((m) => m.method !== "note").length
                ? payInstructions
                    .filter((m) => m.method !== "note")
                    .map((m) => ({
                      value: m.method,
                      label: m.title,
                    }))
                : [{ value: "", label: "Aucun moyen activé dans le hub" }],
            },
            {
              name: "reference",
              label: "Référence (virement, transaction…)",
              optional: true,
            },
            {
              name: "receivedAt",
              label: "Reçu le",
              type: "date",
              value: new Date().toISOString().slice(0, 10),
            },
          ],
        },
      {
        key: "ticket",
        title: "Nouvelle demande d’assistance",
        hint: "Visible uniquement par vous et l’agence concernée.",
        command: "ticket",
        fields: [
          { name: "subject", label: "Sujet" },
          { name: "body", label: "Votre message" },
        ],
      },
      tickets.length > 0 && {
        key: "replyTicket",
        title: "Répondre à une demande",
        hint: "La réponse s’ajoute à la conversation.",
        command: "replyTicket",
        fields: [
          pick("ticketId", "Demande", tickets),
          { name: "body", label: "Réponse" },
        ],
      },
    ] as (Task | false)[]
  ).filter(Boolean) as Task[];
  const current = tasks.find((t) => t.key === task);
  const hasTask = (key: string) => tasks.some((t) => t.key === key);
  const openTask = (key: string, values: Record<string, string> = {}) => {
    setPreset(values);
    setTask(key);
    setDetail(null);
    setMessage("");
    window.scrollTo({ top: 0 });
  };

  /* ---------- Navigation ---------- */
  type Item = [string, string, number | null];
  const unreadWhatsApp = (() => {
    const last = new Map<string, string>();
    for (const m of of("message")
      .slice()
      .sort((a, b) => String(a.payload.at).localeCompare(String(b.payload.at))))
      last.set(String(m.payload.phone), String(m.payload.direction));
    return [...last.values()].filter((d) => d === "in").length;
  })();
  const nav: [string, Item[]][] = [
    [
      "",
      staff
        ? [["dashboard", "Tableau de bord", null]]
        : [["home", "Accueil", null]],
    ],
    [
      "Ventes",
      [
        ...(staff && actor.role !== "finance"
          ? ([["quote", "Demandes web", quotesToHandle.length]] as Item[])
          : []),
        ["proposal", "Propositions", proposals.length],
        ...(staff
          ? ([["clients", "Clients", clientAccounts.length]] as Item[])
          : []),
      ],
    ],
    [
      "Opérations",
      [
        ["shipment", "Expéditions", shipments.length],
        ["parcel", "Colis", parcels.length],
        ...(staff
          ? ([["departure", "Départs", departures.length]] as Item[])
          : []),
        ["event", "Historique", events.length],
      ],
    ],
    [
      "Finance",
      [
        ...(can("admin", "finance", "client")
          ? ([
              [
                "payment",
                actor.role === "client" ? "Mes paiements" : "Encaissements",
                payments.length,
              ],
            ] as Item[])
          : []),
        ...(hub ? ([["hub", "Hub de paiement", null]] as Item[]) : []),
      ],
    ],
    [
      "Support",
      [
        ...(can("admin", "manager", "agent")
          ? ([["whatsapp", "WhatsApp", unreadWhatsApp]] as Item[])
          : []),
        ["ticket", "Assistance", tickets.length],
        ["document", "Documents privés", of("document").length],
      ],
    ],
    [
      "Analyse",
      staff
        ? [
            ["reports", "Rapports", null],
            ...(actor.role === "admin"
              ? ([["audit", "Journal d’activité", null]] as Item[])
              : []),
          ]
        : [],
    ],
  ];
  const go = (v: string, state = "") => {
    setView(v);
    setStateFilter(state);
    setAgencyFilter("");
    setSearch("");
    setTask("");
    setDetail(null);
  };
  const open = (v: string, kind: string, id: string) => {
    setView(v);
    setStateFilter("");
    setDetail({ kind, id });
  };
  const title =
    nav.flatMap(([, items]) => items).find(([k]) => k === view)?.[1] || "";

  /* ---------- Lignes par module ---------- */
  function rowsFor(kind: string): { head: string[]; rows: Row[] } {
    const ref = (v: unknown) => (
      <span className="ref" key="r" title={String(v)}>
        {shortRef(v)}
      </span>
    );
    const pill = (v: unknown) => <Pill key="s" value={v} />;
    if (kind === "quote")
      return {
        head: [
          "Référence",
          "Client",
          "Service",
          "Destination",
          "Volume",
          "Agence",
          "État",
          "Reçue le",
        ],
        rows: quotes.map((q) => {
          const v = [
            q.reference,
            q.name,
            services[q.service] || q.service,
            q.destination,
            fr(Number(q.volume), 3) + " m³",
            agencies[q.agency],
            stateLabel(q.status),
            date(q.createdAt, q.agency),
          ];
          return {
            id: q.id,
            kind,
            status: q.status,
            agency: q.agency,
            at: q.createdAt,
            text: v.join(" ") + " " + q.description + " " + q.email,
            csv: v,
            cells: [
              ref(q.reference),
              v[1],
              v[2],
              v[3],
              v[4],
              v[5],
              pill(q.status),
              v[7],
            ],
          };
        }),
      };
    if (kind === "clients")
      return {
        head: [
          "Client",
          "Agence",
          "Expéditions",
          "En cours",
          "Propositions",
          "Accepté (EUR)",
        ],
        rows: clientAccounts.map((a) => {
          const own = shipments.filter((s) => s.owner === a.id),
            props = proposals.filter((p) => p.owner === a.id),
            accepted = props
              .filter(
                (p) =>
                  p.payload.status === "acceptee" &&
                  p.payload.currency === "EUR",
              )
              .reduce((s, p) => s + Number(p.payload.totalMinor), 0);
          const v = [
            a.name || a.email,
            agencies[a.agency],
            String(own.length),
            String(
              own.filter(
                (s) => !["remis", "annule"].includes(String(s.payload.status)),
              ).length,
            ),
            String(props.length),
            money(accepted, "EUR"),
          ];
          return {
            id: a.id,
            kind,
            agency: a.agency,
            at: "",
            text: v.join(" "),
            csv: v,
            cells: [
              <span className="who" key="r">
                <b>{a.name || a.email}</b>
                {a.name && <small>{a.email}</small>}
              </span>,
              ...v.slice(1),
            ],
          };
        }),
      };
    const list = of(kind);
    const base = (e: Entity, v: string[], cells: React.ReactNode[]): Row => ({
      id: e.id,
      kind,
      status: e.payload.status ? String(e.payload.status) : undefined,
      agency: e.agency,
      at: e.createdAt,
      text: v.join(" "),
      csv: v,
      cells,
    });
    const ship = (id: unknown) =>
      String(shipments.find((s) => s.id === id)?.payload.reference ?? "—");
    switch (kind) {
      case "shipment":
        return {
          head: [
            "Référence",
            "Client",
            "Service",
            "Destination",
            "Agence",
            "État",
            "Ouverte le",
          ],
          rows: list.map((e) => {
            const p = e.payload;
            const v = [
              String(p.reference),
              email(e.owner),
              services[String(p.service)],
              String(p.destination),
              agencies[e.agency],
              stateLabel(p.status),
              date(e.createdAt, e.agency),
            ];
            return base(e, v, [
              ref(p.reference),
              v[1],
              v[2],
              v[3],
              v[4],
              pill(p.status),
              v[6],
            ]);
          }),
        };
      case "parcel":
        return {
          head: [
            "Référence",
            "Contenu",
            "Déclaré",
            "Mesuré",
            "Contrôle",
            "Agence",
          ],
          rows: list.map((e) => {
            const p = e.payload;
            const review = p.priceReviewRequired
              ? p.priceReviewApproved
                ? ["Écart validé", "ok"]
                : ["À valider", "bad"]
              : ["Conforme", "ok"];
            const v = [
              String(p.reference),
              String(p.description),
              measures(p.declared),
              measures(p.controlled),
              review[0],
              agencies[e.agency],
            ];
            return base(e, v, [
              ref(p.reference),
              v[1],
              <span className="measures" key="d">
                {v[2]}
              </span>,
              <span className="measures" key="c">
                {v[3]}
              </span>,
              <span className={"pill " + review[1]} key="v">
                {review[0]}
              </span>,
              v[5],
            ]);
          }),
        };
      case "departure":
        return {
          head: [
            "Mode",
            "Agence",
            "Date prévue",
            "Expéditions",
            "Volume",
            "État",
          ],
          rows: list.map((e) => {
            const p = e.payload;
            const ids = (p.shipments as string[]) || [];
            const vol = parcelVolume(
              parcels.filter((x) => ids.includes(String(x.payload.shipmentId))),
            );
            const v = [
              services[String(p.mode)],
              agencies[e.agency],
              date(p.confirmedAt || p.scheduledAt, e.agency),
              String(ids.length),
              fr(vol, 3) + " m³",
              stateLabel(p.status),
            ];
            return {
              ...base(e, v, [v[0], v[1], v[2], v[3], v[4], pill(p.status)]),
              at: String(p.scheduledAt),
            };
          }),
        };
      case "proposal":
        return {
          head: [
            "Numéro",
            "Client",
            "Version",
            "Montant",
            "Validité",
            "État",
            "Règlement",
          ],
          rows: list.map((e) => {
            const p = e.payload;
            const v = [
              String(p.number),
              email(e.owner),
              "v" + String(p.version),
              money(Number(p.totalMinor), String(p.currency)),
              String(p.validUntil ?? "—"),
              stateLabel(p.status),
              payState(e) ? stateLabel(payState(e)) : "—",
            ];
            return base(e, v, [
              ref(p.number),
              v[1],
              v[2],
              v[3],
              v[4],
              pill(p.status),
              payState(e) ? <Pill key="pay" value={payState(e)} /> : "—",
            ]);
          }),
        };
      case "payment":
        return {
          head: [
            "Reçu le",
            "Proposition",
            "Client",
            "Moyen",
            "Montant",
            "Référence",
          ],
          rows: list.map((e) => {
            const p = e.payload;
            const v = [
              date(p.receivedAt, e.agency, false),
              String(p.proposalNumber ?? "—"),
              email(e.owner),
              methodNames[String(p.method)] || String(p.method),
              money(Number(p.amountMinor), String(p.currency)),
              String(p.reference || "—"),
            ];
            return {
              ...base(e, v, [
                v[0],
                ref(v[1]),
                v[2],
                v[3],
                <b key="m">{v[4]}</b>,
                v[5],
              ]),
              at: String(p.receivedAt),
            };
          }),
        };
      case "event":
        return {
          head: ["État", "Expédition", "Lieu", "Date", "Commentaire"],
          rows: list.map((e) => {
            const p = e.payload;
            const v = [
              stateLabel(p.status),
              ship(p.shipmentId),
              String(p.location ?? "—"),
              date(p.occurredAt || e.createdAt, e.agency),
              String(p.reason ?? "—"),
            ];
            return base(e, v, [pill(p.status), ref(v[1]), v[2], v[3], v[4]]);
          }),
        };
      case "document":
        return {
          head: ["Document", "Agence", "Ajouté le"],
          rows: list.map((e) => {
            const v = [
              String(e.payload.type ?? "Document"),
              agencies[e.agency],
              date(e.createdAt, e.agency),
            ];
            return base(e, v, v);
          }),
        };
      case "ticket":
        return {
          head: ["Sujet", "Agence", "Réponses", "État", "Ouverte le"],
          rows: list.map((e) => {
            const p = e.payload;
            const v = [
              String(p.subject),
              agencies[e.agency],
              String((p.replies as unknown[])?.length ?? 0),
              stateLabel(p.status),
              date(e.createdAt, e.agency),
            ];
            return base(e, v, [
              <span className="ref" key="r">
                {v[0]}
              </span>,
              v[1],
              v[2],
              pill(p.status),
              v[4],
            ]);
          }),
        };
    }
    return { head: [], rows: [] };
  }

  /* ---------- Vue liste ---------- */
  function listView(kind: string) {
    const { head, rows } = rowsFor(kind);
    const statesHere = [
      ...new Set(rows.map((r) => r.status).filter(Boolean)),
    ] as string[];
    const agenciesHere = [...new Set(rows.map((r) => r.agency))];
    const shown = rows
      .filter((r) => !stateFilter || r.status === stateFilter)
      .filter((r) => !agencyFilter || r.agency === agencyFilter)
      .filter((r) => r.text.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (oldestFirst ? 1 : -1) * a.at.localeCompare(b.at));
    const openable = kind !== "clients";
    return (
      <div className="panel">
        <div className="panel-head">
          <div className="filters" role="group" aria-label="Filtres">
            {(statesHere.length > 1 || stateFilter) && (
              <>
                <button
                  type="button"
                  className={"chip" + (!stateFilter ? " on" : "")}
                  onClick={() => setStateFilter("")}
                >
                  Tous
                </button>
                {[...new Set([...statesHere, stateFilter].filter(Boolean))].map(
                  (s) => (
                    <button
                      type="button"
                      key={s}
                      className={"chip" + (stateFilter === s ? " on" : "")}
                      aria-pressed={stateFilter === s}
                      onClick={() => setStateFilter(stateFilter === s ? "" : s)}
                    >
                      {stateLabel(s)}
                    </button>
                  ),
                )}
              </>
            )}
            {agenciesHere.length > 1 && (
              <select
                aria-label="Agence"
                className="chip-select"
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
              >
                <option value="">Toutes les agences</option>
                {agenciesHere.map((a) => (
                  <option key={a} value={a}>
                    {agencies[a]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="panel-tools">
            <label>
              <span className="sr-only">Rechercher</span>
              <input
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {kind !== "clients" && (
              <button
                type="button"
                className="text-button"
                onClick={() => setOldestFirst(!oldestFirst)}
              >
                {oldestFirst ? "Plus anciens d’abord" : "Plus récents d’abord"}
              </button>
            )}
            <button
              type="button"
              className="button secondary small"
              disabled={!shown.length}
              onClick={() =>
                download(
                  `express-congo-${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
                  head,
                  shown.map((r) => r.csv),
                )
              }
            >
              Exporter en CSV
            </button>
          </div>
        </div>
        {shown.length ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  {head.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    className={openable ? "clickable" : undefined}
                    tabIndex={openable ? 0 : undefined}
                    onClick={
                      openable ? () => setDetail({ kind, id: r.id }) : undefined
                    }
                    onKeyDown={
                      openable
                        ? (e) => {
                            if (e.key === "Enter")
                              setDetail({ kind, id: r.id });
                          }
                        : undefined
                    }
                  >
                    {r.cells.map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-foot">
              {shown.length} sur {rows.length} dossier
              {rows.length > 1 ? "s" : ""}
              {openable ? " · cliquez une ligne pour ouvrir la fiche" : ""}
            </p>
          </div>
        ) : (
          <p className="empty">
            {rows.length
              ? "Aucun dossier ne correspond à ces filtres."
              : "Aucun dossier dans votre périmètre pour l’instant."}
          </p>
        )}
      </div>
    );
  }

  /* ---------- Fiche détaillée ---------- */
  function detailView() {
    if (!detail) return null;
    const close = () => setDetail(null);
    const dl = (pairs: [string, React.ReactNode][]) => (
      <dl className="recap">
        {pairs.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    );
    let head: React.ReactNode = null,
      body: React.ReactNode = null;
    if (detail.kind === "quote") {
      const q = quotes.find((x) => x.id === detail.id);
      if (!q) return null;
      head = (
        <>
          <span className="ref">{q.reference}</span> <Pill value={q.status} />
        </>
      );
      body = (
        <>
          {dl([
            ["Client", q.name],
            [
              "Profil",
              q.kind === "professionnel" ? "Professionnel" : "Particulier",
            ],
            [
              "Téléphone",
              <a key="t" href={"tel:" + q.phone.replace(/[^\d+]/g, "")}>
                {q.phone}
              </a>,
            ],
            [
              "Email",
              <a key="m" href={"mailto:" + q.email}>
                {q.email}
              </a>,
            ],
            [
              "Réponse souhaitée par",
              q.channel === "telephone" ? "Téléphone" : "Email",
            ],
            ["Ville", q.city || "—"],
            ["Service", services[q.service] || q.service],
            ["Destination", q.destination],
            ["Colis", String(q.parcels)],
            ["Volume déclaré", fr(Number(q.volume), 3) + " m³"],
            ["Date souhaitée", q.desiredDate || "—"],
            ["Agence", agencies[q.agency]],
          ])}
          <h3>Marchandises</h3>
          <p>{q.description}</p>
          {q.customs && (
            <>
              <h3>Dédouanement</h3>
              <p>{q.customs}</p>
            </>
          )}
          {q.comment && (
            <>
              <h3>Commentaire</h3>
              <p>{q.comment}</p>
            </>
          )}
          {can("admin", "manager", "agent", "sales") &&
            (quoteNext[q.status] || []).length > 0 && (
              <div className="drawer-actions">
                <h3>Faire avancer la demande</h3>
                {(quoteNext[q.status] || []).map((to, i) => (
                  <button
                    key={to}
                    className={"button small" + (i ? " secondary" : "")}
                    onClick={() =>
                      run("quoteStatus", { quoteId: q.id, status: to })
                    }
                  >
                    Passer à « {stateLabel(to)} »
                  </button>
                ))}
              </div>
            )}
        </>
      );
    } else {
      const e = entities.find((x) => x.id === detail.id);
      if (!e) return null;
      const p = e.payload;
      head = (
        <>
          <span className="ref">
            {e.kind === "departure"
              ? `${services[String(p.mode)]} · ${date(p.confirmedAt || p.scheduledAt, e.agency, false)}`
              : String(
                  p.reference || p.number || p.subject || stateLabel(p.status),
                )}
          </span>{" "}
          {p.status ? <Pill value={p.status} /> : null}
        </>
      );
      if (e.kind === "shipment") {
        const timeline = [
          {
            at: e.createdAt,
            status: "cree",
            where: agencies[e.agency],
            note: "Dossier ouvert",
          },
          ...byShipment(events, e.id).map((ev) => ({
            at: String(ev.payload.occurredAt || ev.createdAt),
            status: String(ev.payload.status),
            where: String(ev.payload.location ?? ""),
            note: String(ev.payload.reason ?? ""),
          })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        const own = byShipment(parcels, e.id),
          props = byShipment(proposals, e.id),
          dep = departures.find((d) =>
            ((d.payload.shipments as string[]) || []).includes(e.id),
          );
        body = (
          <>
            {dl([
              ["Client", email(e.owner)],
              ["Service", services[String(p.service)]],
              ["Destination", String(p.destination)],
              ["Agence", agencies[e.agency]],
              [
                "Départ",
                dep
                  ? `${services[String(dep.payload.mode)]} — ${date(dep.payload.scheduledAt, dep.agency)}`
                  : "Non affecté",
              ],
              [
                "Volume contrôlé",
                own.length ? fr(parcelVolume(own), 3) + " m³" : "—",
              ],
            ])}
            {typeof p.trackingCode === "string" && (
              <TrackingCard
                reference={String(p.reference)}
                code={p.trackingCode}
              />
            )}
            {staff && (
              <div className="drawer-actions">
                {hasTask("event") && (
                  <button
                    className="button small"
                    onClick={() => openTask("event", { shipmentId: e.id })}
                  >
                    Mettre à jour le suivi
                  </button>
                )}
                {hasTask("receiveParcel") && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      openTask("receiveParcel", { shipmentId: e.id })
                    }
                  >
                    Réceptionner un colis
                  </button>
                )}
                {hasTask("assignDeparture") && !dep && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      openTask("assignDeparture", { shipmentId: e.id })
                    }
                  >
                    Affecter à un départ
                  </button>
                )}
                {hasTask("proposal") && (
                  <button
                    className="button secondary small"
                    onClick={() => openTask("proposal", { shipmentId: e.id })}
                  >
                    Envoyer une proposition
                  </button>
                )}
                {hasTask("transferShipment") &&
                  !["remis", "annule"].includes(String(p.status)) && (
                    <button
                      className="button secondary small"
                      onClick={() =>
                        openTask("transferShipment", { shipmentId: e.id })
                      }
                    >
                      Transférer d’agence
                    </button>
                  )}
              </div>
            )}
            {Array.isArray(p.transfers) && p.transfers.length > 0 && (
              <>
                <h3>Transferts</h3>
                <ul className="mini-list">
                  {(
                    p.transfers as {
                      from: string;
                      to: string;
                      reason: string;
                      at: string;
                    }[]
                  ).map((t, i) => (
                    <li key={i}>
                      <div>
                        <strong>
                          {agencies[t.from]} → {agencies[t.to]}
                        </strong>
                        <span>{t.reason}</span>
                      </div>
                      <span>{date(t.at, t.to)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>Suivi</h3>
            <ol className="timeline">
              {timeline.map((t, i) => (
                <li key={i}>
                  <Pill value={t.status} />
                  <span>{date(t.at, e.agency)}</span>
                  <small>{[t.where, t.note].filter(Boolean).join(" — ")}</small>
                </li>
              ))}
            </ol>
            <h3>Colis ({own.length})</h3>
            {own.length ? (
              <ul className="mini-list">
                {own.map((x) => (
                  <li key={x.id}>
                    <div>
                      <strong>{String(x.payload.description)}</strong>
                      <span className="measures">
                        Mesuré : {measures(x.payload.controlled)}
                      </span>
                    </div>
                    <a href={"/api/demo/label?id=" + x.id} target="_blank">
                      Étiquette
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Aucun colis réceptionné.</p>
            )}
            <h3>Propositions ({props.length})</h3>
            {props.length ? (
              <ul className="mini-list">
                {props.map((x) => (
                  <li key={x.id}>
                    <div>
                      <strong>
                        {money(
                          Number(x.payload.totalMinor),
                          String(x.payload.currency),
                        )}
                      </strong>
                      <span>
                        v{String(x.payload.version)} ·{" "}
                        {stateLabel(x.payload.status)}
                      </span>
                    </div>
                    <a href={"/api/demo/proposal-pdf?id=" + x.id}>PDF</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Aucune proposition envoyée.</p>
            )}
          </>
        );
      } else if (e.kind === "parcel") {
        body = (
          <>
            {dl([
              ["Contenu", String(p.description)],
              ["Déclaré", measures(p.declared)],
              ["Mesuré", measures(p.controlled)],
              [
                "Contrôle",
                p.priceReviewRequired
                  ? p.priceReviewApproved
                    ? "Écart validé"
                    : "Écart à valider"
                  : "Conforme",
              ],
              ["État et réserves", String(p.reserves || "—")],
              ["Agence", agencies[e.agency]],
            ])}
            <div className="drawer-actions">
              <a
                className="button secondary small"
                href={"/api/demo/label?id=" + e.id}
                target="_blank"
              >
                Imprimer l’étiquette
              </a>
              {hasTask("approveMeasures") &&
                !!p.priceReviewRequired &&
                !p.priceReviewApproved && (
                  <button
                    className="button small"
                    onClick={() =>
                      openTask("approveMeasures", { parcelId: e.id })
                    }
                  >
                    Valider l’écart
                  </button>
                )}
            </div>
          </>
        );
      } else if (e.kind === "departure") {
        const ids = (p.shipments as string[]) || [];
        const loaded = parcels.filter((x) =>
          ids.includes(String(x.payload.shipmentId)),
        );
        body = (
          <>
            {dl([
              ["Mode", services[String(p.mode)]],
              ["Agence", agencies[e.agency]],
              ["Date prévisionnelle", date(p.scheduledAt, e.agency)],
              [
                "Date confirmée",
                p.confirmedAt ? date(p.confirmedAt, e.agency) : "Non confirmée",
              ],
              ["Expéditions", String(ids.length)],
              [
                "Volume / poids",
                `${fr(parcelVolume(loaded), 3)} m³ · ${fr(parcelWeight(loaded), 1)} kg`,
              ],
            ])}
            <div className="drawer-actions">
              {hasTask("confirmDeparture") && p.status !== "confirme" && (
                <button
                  className="button small"
                  onClick={() =>
                    openTask("confirmDeparture", { departureId: e.id })
                  }
                >
                  Confirmer la date
                </button>
              )}
              <a
                className="button secondary small"
                href={"/api/demo/manifest?id=" + e.id}
              >
                Exporter le manifeste
              </a>
            </div>
            {hasTask("assignDeparture") && (
              <BulkAssign
                departure={e}
                candidates={shipments.filter(
                  (x) =>
                    x.agency === e.agency &&
                    x.payload.service === p.mode &&
                    !x.payload.departure &&
                    !["remis", "annule"].includes(String(x.payload.status)),
                )}
              />
            )}
            <h3>Expéditions chargées</h3>
            {ids.length ? (
              <ul className="mini-list">
                {ids.map((id) => {
                  const s = shipments.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <strong>{shortRef(s?.payload.reference ?? id)}</strong>
                      <span>{s ? stateLabel(s.payload.status) : ""}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hint">Aucune expédition affectée.</p>
            )}
          </>
        );
      } else if (e.kind === "proposal") {
        body = (
          <>
            {dl([
              ["Client", email(e.owner)],
              ["Version", "v" + String(p.version)],
              ["Montant", money(Number(p.totalMinor), String(p.currency))],
              ["Valable jusqu’au", date(p.validUntil, e.agency, false)],
              [
                "Acceptée le",
                p.acceptedAt ? date(p.acceptedAt, e.agency) : "—",
              ],
            ])}
            {Array.isArray(p.lines) && p.lines.length > 0 && (
              <>
                <h3>Détail</h3>
                <table className="lines-view">
                  <thead>
                    <tr>
                      <th>Prestation</th>
                      <th>Qté</th>
                      <th>Prix unitaire</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      p.lines as {
                        label: string;
                        quantity: number;
                        unitMinor: string;
                        totalMinor: string;
                      }[]
                    ).map((l, i) => (
                      <tr key={i}>
                        <td>{l.label}</td>
                        <td>
                          {fr(Number(l.quantity), 3).replace(/,?0+$/, "")}
                        </td>
                        <td>
                          {money(Number(l.unitMinor), String(p.currency))}
                        </td>
                        <td>
                          {money(Number(l.totalMinor), String(p.currency))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td>{money(Number(p.totalMinor), String(p.currency))}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
            <h3>Conditions, inclusions et exclusions</h3>
            <p>{String(p.exclusions ?? "—")}</p>
            {p.status === "acceptee" && (
              <div className="pay-box">
                <div className="pay-head">
                  <div>
                    <span className="eyebrow">Règlement</span>
                    <b>
                      {money(paidFor(e.id), String(p.currency))} encaissé sur{" "}
                      {money(Number(p.totalMinor), String(p.currency))}
                    </b>
                  </div>
                  <Pill value={payState(e)} />
                </div>
                <div className="pay-bar" aria-hidden>
                  <i
                    style={{
                      width:
                        Math.min(
                          100,
                          (paidFor(e.id) / Number(p.totalMinor)) * 100,
                        ) + "%",
                    }}
                  />
                </div>
                {payState(e) !== "payee" && payInstructions.length > 0 && (
                  <>
                    <p className="hint">
                      Référence à indiquer avec le paiement :{" "}
                      <b className="ref">{String(p.number)}</b>
                    </p>
                    <ul className="pay-methods">
                      {payInstructions.map((m) => (
                        <li key={m.method}>
                          <strong>{m.title}</strong>
                          {m.lines.map((l) => (
                            <span key={l}>{l}</span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {payState(e) !== "payee" && !payInstructions.length && (
                  <p className="hint">
                    Les moyens de paiement seront communiqués par l’agence.
                  </p>
                )}
                {hasTask("recordPayment") && payState(e) !== "payee" && (
                  <button
                    className="button small"
                    onClick={() =>
                      openTask("recordPayment", {
                        proposalId: e.id,
                        amount: String(
                          (Number(p.totalMinor) - paidFor(e.id)) /
                            (p.currency === "EUR" ? 100 : 1),
                        ).replace(".", ","),
                      })
                    }
                  >
                    Enregistrer un encaissement
                  </button>
                )}
              </div>
            )}
            <div className="drawer-actions">
              <a
                className="button secondary small"
                href={"/api/demo/proposal-pdf?id=" + e.id}
              >
                Télécharger le PDF
              </a>
              {actor!.role === "client" &&
                p.status === "proposition-envoyee" && (
                  <button
                    className="button small"
                    onClick={() => run("acceptProposal", { proposalId: e.id })}
                  >
                    Accepter la proposition
                  </button>
                )}
            </div>
            <p className="hint">
              Une acceptation ne vaut pas confirmation de paiement.
            </p>
          </>
        );
      } else if (e.kind === "ticket") {
        const replies = (p.replies as { body?: string }[]) || [];
        body = (
          <>
            <h3>Message</h3>
            <p>{String(p.body ?? "")}</p>
            <h3>Réponses ({replies.length})</h3>
            {replies.map((r, i) => (
              <p key={i} className="reply">
                {String(r.body ?? "")}
              </p>
            ))}
            {hasTask("replyTicket") && (
              <div className="drawer-actions">
                <button
                  className="button small"
                  onClick={() => openTask("replyTicket", { ticketId: e.id })}
                >
                  Répondre
                </button>
              </div>
            )}
          </>
        );
      } else {
        body = dl(
          Object.entries(p)
            .filter(([, v]) => v !== null && typeof v !== "object")
            .map(([k, v]) => [k, k === "status" ? stateLabel(v) : String(v)]),
        );
      }
    }
    return (
      <div className="drawer-backdrop" onClick={close}>
        <aside
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Fiche du dossier"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="drawer-head">
            <div>{head}</div>
            <button className="text-button" onClick={close} autoFocus>
              Fermer
            </button>
          </div>
          <div className="drawer-body">{body}</div>
        </aside>
      </div>
    );
  }

  /* ---------- Tableau de bord ---------- */
  function dashboard() {
    const byCur = (status: string, cur: string) =>
      proposals.filter(
        (p) => p.payload.status === status && p.payload.currency === cur,
      );
    const sum = (l: Entity[]) =>
      l.reduce((s, p) => s + Number(p.payload.totalMinor), 0);
    const currencies = ["EUR", "XAF"].filter(
      (c) =>
        byCur("proposition-envoyee", c).length + byCur("acceptee", c).length >
        0,
    );
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (13 - i));
      return d;
    });
    const dayKey = (v: string) => new Date(v).toDateString();
    const activity = days.map((d) => {
      const k = d.toDateString();
      return {
        key: k,
        label: new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "short",
        }).format(d),
        value:
          entities.filter((e) => dayKey(e.createdAt) === k).length +
          quotes.filter((q) => dayKey(q.createdAt) === k).length,
      };
    });
    const upcoming = departures
      .filter(
        (d) =>
          Date.parse(String(d.payload.scheduledAt)) >= Date.now() - 86400000,
      )
      .sort((a, b) =>
        String(a.payload.scheduledAt).localeCompare(
          String(b.payload.scheduledAt),
        ),
      )
      .slice(0, 5);
    const todo: { key: string; text: string; tone: string; go: () => void }[] =
      [
        ...quotesToHandle.slice(0, 4).map((q) => ({
          key: q.id,
          text: `Demande web de ${q.name} — ${services[q.service] || q.service} vers ${q.destination}`,
          tone: "wait",
          go: () => open("quote", "quote", q.id),
        })),
        ...toReview.slice(0, 3).map((p) => ({
          key: p.id,
          text: `Écart de mesures à valider — ${String(p.payload.description)}`,
          tone: "bad",
          go: () => open("parcel", "parcel", p.id),
        })),
        ...incidents.slice(0, 3).map((s) => ({
          key: s.id,
          text: `Incident sur ${shortRef(s.payload.reference)}`,
          tone: "bad",
          go: () => open("shipment", "shipment", s.id),
        })),
        ...ready.slice(0, 3).map((s) => ({
          key: s.id,
          text: `Retrait à préparer — ${shortRef(s.payload.reference)} (${String(s.payload.destination)})`,
          tone: "ok",
          go: () => open("shipment", "shipment", s.id),
        })),
        ...openTickets.slice(0, 3).map((t) => ({
          key: t.id,
          text: `Assistance : ${String(t.payload.subject)}`,
          tone: "wait",
          go: () => open("ticket", "ticket", t.id),
        })),
      ];
    const kpis = (
      [
        ["quote", quotesToHandle.length, "Demandes web à traiter", "", true],
        ["shipment", active.length, "Expéditions en cours", "", false],
        ["parcel", toReview.length, "Écarts de mesures à valider", "", true],
        ["shipment", incidents.length, "En incident", "incident", true],
        [
          "shipment",
          ready.length,
          "Prêtes au retrait",
          "disponible-au-retrait",
          false,
        ],
      ] as [string, number, string, string, boolean][]
    ).filter(([k]) => k !== "quote" || actor!.role !== "finance");
    return (
      <>
        <div className="kpis five">
          {kpis.map(([k, n, label, st, alert]) => (
            <button
              key={label}
              className={"kpi" + (alert && n > 0 ? " alert" : "")}
              onClick={() => go(k, st)}
            >
              <b>{n}</b>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="dash-grid">
          <section className="widget">
            <h2>À faire</h2>
            {todo.length ? (
              <ul className="todo">
                {todo.slice(0, 8).map((t) => (
                  <li key={t.key}>
                    <button type="button" onClick={t.go}>
                      <i className={"dot " + t.tone} aria-hidden />
                      {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                Rien en attente. Les nouvelles demandes et les écarts
                apparaîtront ici.
              </p>
            )}
          </section>
          <section className="widget">
            <h2>Propositions</h2>
            {currencies.length ? (
              currencies.map((c) => (
                <div className="money-row" key={c}>
                  {(
                    [
                      ["proposition-envoyee", "En attente de réponse"],
                      ["acceptee", "Acceptées"],
                    ] as const
                  ).map(([st, label]) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => go("proposal", st)}
                    >
                      <span>{label}</span>
                      <b>{money(sum(byCur(st, c)), c)}</b>
                      <small>
                        {byCur(st, c).length} proposition
                        {byCur(st, c).length > 1 ? "s" : ""}
                      </small>
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <p className="empty">
                Aucune proposition envoyée pour l’instant.
              </p>
            )}
            <p className="hint">
              Une proposition acceptée n’est pas un paiement encaissé.
            </p>
          </section>
          <section className="widget">
            <h2>Expéditions par étape</h2>
            <HBars
              title="Expéditions par étape"
              bars={[...pipeline, "incident"].map((s) => ({
                key: s,
                label: stateLabel(s),
                value: shipments.filter((x) => x.payload.status === s).length,
                onSelect: () => go("shipment", s),
              }))}
            />
          </section>
          <section className="widget">
            <h2>Activité des 14 derniers jours</h2>
            <Columns title="Dossiers enregistrés par jour" bars={activity} />
            <p className="hint">
              Demandes web, dossiers, colis, événements et propositions
              enregistrés chaque jour.
            </p>
          </section>
          <section className="widget">
            <h2>Prochains départs</h2>
            {upcoming.length ? (
              <ul className="mini-list">
                {upcoming.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="link-row"
                      onClick={() => open("departure", "departure", d.id)}
                    >
                      <strong>{date(d.payload.scheduledAt, d.agency)}</strong>
                      <span>
                        {services[String(d.payload.mode)]} ·{" "}
                        {agencies[d.agency]} ·{" "}
                        {((d.payload.shipments as string[]) || []).length}{" "}
                        expédition(s)
                      </span>
                    </button>
                    <Pill value={d.payload.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Aucun départ programmé.</p>
            )}
          </section>
          <section className="widget">
            <h2>Dernières demandes web</h2>
            {quotes.length ? (
              <ul className="mini-list">
                {quotes.slice(0, 5).map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="link-row"
                      onClick={() => open("quote", "quote", q.id)}
                    >
                      <strong>{q.name}</strong>
                      <span>
                        {services[q.service] || q.service} → {q.destination} ·{" "}
                        {fr(Number(q.volume), 3)} m³
                      </span>
                    </button>
                    <Pill value={q.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                Les demandes envoyées depuis le site apparaîtront ici.
              </p>
            )}
          </section>
        </div>
      </>
    );
  }

  /* ---------- Rapports ---------- */
  function reports() {
    const sent = proposals.length,
      acceptedN = proposals.filter(
        (p) => p.payload.status === "acceptee",
      ).length;
    const byAgency = Object.keys(agencies).map((a) => {
      const pa = parcels.filter((p) => p.agency === a);
      return { a, vol: parcelVolume(pa), kg: parcelWeight(pa), n: pa.length };
    });
    const loadHead = [
      "Départ",
      "Mode",
      "Agence",
      "Expéditions",
      "Colis",
      "Volume (m³)",
      "Poids (kg)",
      "État",
    ];
    const loads = departures
      .slice()
      .sort((a, b) =>
        String(a.payload.scheduledAt).localeCompare(
          String(b.payload.scheduledAt),
        ),
      )
      .map((d) => {
        const ids = (d.payload.shipments as string[]) || [];
        const pl = parcels.filter((x) =>
          ids.includes(String(x.payload.shipmentId)),
        );
        return [
          date(d.payload.scheduledAt, d.agency),
          services[String(d.payload.mode)],
          agencies[d.agency],
          String(ids.length),
          String(pl.length),
          fr(parcelVolume(pl), 3),
          fr(parcelWeight(pl), 1),
          stateLabel(d.payload.status),
        ];
      });
    const stageHead = ["Agence", ...pipeline.map(stateLabel), "Incident"];
    const stages = Object.keys(agencies).map((a) => [
      agencies[a],
      ...[...pipeline, "incident"].map((s) =>
        String(
          shipments.filter((x) => x.agency === a && x.payload.status === s)
            .length,
        ),
      ),
    ]);
    const table = (head: string[], rows: string[][], name: string) => (
      <>
        <div className="table-wrap flush">
          <table className="data-table">
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-foot">
          <button
            type="button"
            className="button secondary small"
            disabled={!rows.length}
            onClick={() => download(`express-congo-${name}.csv`, head, rows)}
          >
            Exporter en CSV
          </button>
        </div>
      </>
    );
    return (
      <>
        <div className="kpis">
          {(
            [
              [quotes.length, "Demandes web reçues"],
              [sent, "Propositions envoyées"],
              [acceptedN, "Propositions acceptées"],
              [
                sent ? fr((acceptedN / sent) * 100) + " %" : "—",
                "Taux d’acceptation",
              ],
            ] as [string | number, string][]
          ).map(([n, l]) => (
            <div className="kpi" key={l}>
              <b>{n}</b>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <div className="dash-grid">
          <section className="widget">
            <h2>Volume contrôlé par agence</h2>
            <HBars
              title="Volume contrôlé par agence"
              bars={byAgency.map((x) => ({
                key: x.a,
                label: agencies[x.a],
                value: x.vol,
                display: fr(x.vol, 3) + " m³",
              }))}
            />
            <p className="hint">
              Mesures relevées au comptoir, colis identiques multipliés par leur
              nombre.
            </p>
          </section>
          <section className="widget">
            <h2>Poids pesé par agence</h2>
            <HBars
              title="Poids pesé par agence"
              bars={byAgency.map((x) => ({
                key: x.a,
                label: agencies[x.a],
                value: x.kg,
                display: fr(x.kg, 1) + " kg",
              }))}
            />
            <p className="hint">
              {byAgency.reduce((s, x) => s + x.n, 0)} colis réceptionnés au
              total.
            </p>
          </section>
        </div>
        <section className="panel report">
          <div className="panel-head">
            <h2>Chargement par départ</h2>
          </div>
          {loads.length ? (
            table(loadHead, loads, "chargement-par-depart")
          ) : (
            <p className="empty">Aucun départ programmé.</p>
          )}
        </section>
        <section className="panel report">
          <div className="panel-head">
            <h2>Expéditions par agence et par étape</h2>
          </div>
          {table(stageHead, stages, "expeditions-par-etape")}
        </section>
      </>
    );
  }

  function auditView() {
    return (
      <div className="panel">
        {audit.length ? (
          <div className="table-wrap flush">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Par</th>
                  <th>Dossier</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{date(a.createdAt)}</td>
                    <td>{actions[a.action] || a.action}</td>
                    <td>{email(a.actor) === "—" ? a.actor : email(a.actor)}</td>
                    <td className="ref">{shortRef(a.objectId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="table-foot">
              Les {audit.length} dernières actions enregistrées, sans contenu
              personnel.
            </p>
          </div>
        ) : (
          <p className="empty">Aucune action enregistrée.</p>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-side">
        <div className="app-brand">
          <Image
            src="/assets/logo-expresscongo.png"
            alt="Express Congo"
            width={511}
            height={80}
          />
        </div>
        <nav aria-label="Modules">
          {nav
            .filter(([, items]) => items.length)
            .map(([group, items]) => (
              <div className="nav-group" key={group || "accueil"}>
                {group && <p className="nav-title">{group}</p>}
                {items.map(([k, label, count]) => (
                  <button
                    key={k}
                    className="nav-item"
                    aria-label={label}
                    aria-current={view === k ? "page" : undefined}
                    onClick={() => go(k)}
                  >
                    {label}
                    {count !== null && <span className="count">{count}</span>}
                  </button>
                ))}
              </div>
            ))}
        </nav>
        <div className="app-side-foot">
          <strong>Profil : {roles[actor.role]}</strong>
          Agence de {agencies[actor.agency]}
          <br />
          <button
            className="text-button"
            onClick={async () => {
              await fetch("/api/demo/session", { method: "DELETE" });
              location.reload();
            }}
          >
            Se déconnecter
          </button>
        </div>
      </aside>
      <section className="app-main">
        <div className="app-topbar">
          <h1>{title}</h1>
          <div className="topbar-tools">
            {tasks.length > 0 && (
              <details className="new-menu">
                <summary className="button small">Nouveau</summary>
                <div className="new-menu-list">
                  {tasks.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={(e) => {
                        const menu = e.currentTarget.closest("details");
                        if (menu) menu.open = false;
                        openTask(t.key);
                      }}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {actor.role === "admin" && view === "dashboard" && (
              <button
                type="button"
                className="button small secondary"
                disabled={resetting}
                onClick={async () => {
                  if (
                    !confirm(
                      "Remettre la démonstration à zéro ? Tous les dossiers fictifs sont recréés.",
                    )
                  )
                    return;
                  setResetting(true);
                  await run("resetDemo", {});
                  setResetting(false);
                }}
              >
                {resetting ? "Réinitialisation…" : "Réinitialiser la démo"}
              </button>
            )}
            <span className="demo-flag">
              <i className="live-dot" aria-hidden /> Démonstration en direct
            </span>
          </div>
        </div>
        {message && (
          <p role="alert" className="notice">
            {message}
          </p>
        )}
        {current && (
          <TaskForm
            key={current.key + JSON.stringify(preset)}
            task={current}
            preset={preset}
            run={run}
            close={() => setTask("")}
          />
        )}
        {view === "home" && (
          <ClientHome
            name={people.find((p) => p.id === actor.id)?.name || ""}
            entities={entities}
            whatsapp={whatsapp}
            run={run}
            go={go}
            paidFor={paidFor}
          />
        )}
        {view === "whatsapp" && (
          <WhatsAppHub
            messages={of("message")}
            people={people}
            isAdmin={actor.role === "admin"}
          />
        )}
        {view === "dashboard" && dashboard()}
        {view === "reports" && reports()}
        {view === "audit" && auditView()}
        {view === "hub" && hub && (
          <PaymentHub
            initial={hub.settings}
            providers={hub.providers}
            canEdit={actor.role === "admin"}
          />
        )}
        {!["dashboard", "reports", "audit", "hub", "home", "whatsapp"].includes(
          view,
        ) && listView(view)}
      </section>
      {detailView()}
    </div>
  );
}
