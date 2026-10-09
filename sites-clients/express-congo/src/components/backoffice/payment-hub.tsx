"use client";
import { useState } from "react";
import type { PaymentSettings, Provider } from "@/server/payments";
import { agencies, date } from "./labels";

const statusText: Record<Provider["status"], [string, string]> = {
  "non-configure": ["Non connecté", ""],
  "cles-partielles": ["Clés incomplètes", "bad"],
  "cles-presentes": ["Clés détectées — activation à finaliser", "wait"],
};

/** Hub de paiement : moyens proposés aux clients et connexions en ligne. */
export function PaymentHub({
  initial,
  providers,
  canEdit,
}: {
  initial: PaymentSettings;
  providers: Provider[];
  canEdit: boolean;
}) {
  const [s, setS] = useState(initial),
    [busy, setBusy] = useState(false),
    [problems, setProblems] = useState<string[]>([]),
    [saved, setSaved] = useState("");
  const set = <K extends keyof PaymentSettings>(
    k: K,
    patch: Partial<PaymentSettings[K]>,
  ) => {
    setSaved("");
    setS({ ...s, [k]: { ...(s[k] as object), ...patch } });
  };
  async function save() {
    setBusy(true);
    setProblems([]);
    const r = await fetch("/api/demo/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setS(data.settings);
      setSaved("Moyens de paiement enregistrés.");
    } else
      setProblems(
        data.problems?.length
          ? data.problems
          : [data.message || "Enregistrement impossible."],
      );
  }
  const toggle = (k: "transfer" | "mtn" | "airtel" | "cash", label: string) => (
    <label className="switch">
      <input
        type="checkbox"
        checked={s[k].enabled}
        disabled={!canEdit}
        onChange={(e) => set(k, { enabled: e.target.checked })}
      />
      <span aria-hidden />
      {label}
    </label>
  );
  const field = (
    k: "transfer" | "mtn" | "airtel",
    name: string,
    label: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      {label}
      <input
        value={String((s[k] as Record<string, unknown>)[name] ?? "")}
        disabled={!canEdit}
        onChange={(e) => set(k, { [name]: e.target.value } as never)}
        {...extra}
      />
    </label>
  );
  return (
    <div className="hub">
      <section className="hub-intro panel">
        <div>
          <h2>Comment vos clients vous paient</h2>
          <p className="hint">
            Les moyens activés apparaissent sur chaque proposition acceptée,
            avec son numéro comme référence de paiement. La finance enregistre
            ensuite chaque encaissement reçu.
          </p>
        </div>
        {s.updatedAt && (
          <p className="hint">Dernière modification : {date(s.updatedAt)}</p>
        )}
        {!canEdit && (
          <p className="notice">
            Consultation seule : l’administrateur modifie ces réglages.
          </p>
        )}
      </section>

      <div className="hub-grid">
        <section
          className={"hub-card panel" + (s.transfer.enabled ? " on" : "")}
        >
          <header>
            <span className="hub-icon" aria-hidden>
              €
            </span>
            <div>
              <h3>Compte bancaire — virement</h3>
              <p className="hint">
                Le compte qui reçoit les virements des clients (SEPA).
              </p>
            </div>
            {toggle("transfer", "Proposer")}
          </header>
          <div className="hub-fields">
            {field("transfer", "holder", "Titulaire du compte", {
              autoComplete: "off",
            })}
            {field("transfer", "iban", "IBAN", {
              autoComplete: "off",
              spellCheck: false,
              placeholder: "FR76 …",
            })}
            {field("transfer", "bic", "BIC (facultatif)", {
              autoComplete: "off",
              spellCheck: false,
            })}
            {field("transfer", "bank", "Banque (facultatif)")}
          </div>
        </section>

        {(
          [
            ["mtn", "MTN Mobile Money", "mtn"],
            ["airtel", "Airtel Money", "airtel"],
          ] as const
        ).map(([k, label, tone]) => (
          <section
            key={k}
            className={"hub-card panel" + (s[k].enabled ? " on" : "")}
          >
            <header>
              <span className={"hub-icon " + tone} aria-hidden>
                {k === "mtn" ? "M" : "A"}
              </span>
              <div>
                <h3>{label}</h3>
                <p className="hint">
                  Numéro marchand sur lequel le client envoie le paiement.
                </p>
              </div>
              {toggle(k, "Proposer")}
            </header>
            <div className="hub-fields">
              {field(k, "number", "Numéro marchand", {
                inputMode: "tel",
                placeholder: "+242 06 000 00 00",
              })}
              {field(k, "name", "Nom affiché du compte")}
            </div>
          </section>
        ))}

        <section className={"hub-card panel" + (s.cash.enabled ? " on" : "")}>
          <header>
            <span className="hub-icon cash" aria-hidden>
              ¤
            </span>
            <div>
              <h3>Espèces en agence</h3>
              <p className="hint">Paiement au comptoir, avec reçu.</p>
            </div>
            {toggle("cash", "Proposer")}
          </header>
          <div className="hub-checks" role="group" aria-label="Agences">
            {Object.entries(agencies).map(([a, name]) => (
              <label key={a}>
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={s.cash.agencies.includes(a)}
                  onChange={(e) =>
                    set("cash", {
                      agencies: e.target.checked
                        ? [...s.cash.agencies, a]
                        : s.cash.agencies.filter((x) => x !== a),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </section>
      </div>

      <section className="panel hub-note">
        <label>
          Message affiché au client avec les moyens de paiement (facultatif)
          <textarea
            rows={3}
            maxLength={600}
            disabled={!canEdit}
            value={s.instructions}
            onChange={(e) => {
              setSaved("");
              setS({ ...s, instructions: e.target.value });
            }}
            placeholder="Ex. Indiquez le numéro de proposition dans le libellé du virement."
          />
        </label>
        {problems.length > 0 && (
          <ul role="alert" className="error hub-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {saved && (
          <p role="status" className="success">
            {saved}
          </p>
        )}
        {canEdit && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={save}
          >
            {busy ? "Enregistrement…" : "Enregistrer les moyens de paiement"}
          </button>
        )}
      </section>

      <section className="panel hub-online">
        <div className="panel-head">
          <div>
            <h2>Paiement en ligne</h2>
            <p className="hint">
              Pour encaisser directement depuis la proposition (carte ou Mobile
              Money), reliez un compte marchand. Les clés secrètes ne se
              saisissent jamais ici : elles se déposent dans Cloudflare, puis
              apparaissent comme détectées.
            </p>
          </div>
        </div>
        <ul className="providers">
          {providers.map((p) => (
            <li key={p.id}>
              <div>
                <h3>{p.name}</h3>
                <p className="hint">{p.description}</p>
                <p className="secrets">
                  Secrets attendus :{" "}
                  {p.secrets.map((k) => (
                    <code key={k}>{k}</code>
                  ))}
                </p>
              </div>
              <div className="provider-side">
                <span className={"pill " + statusText[p.status][1]}>
                  {statusText[p.status][0]}
                </span>
                <a href={p.docs} target="_blank" rel="noreferrer">
                  Obtenir les clés ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
        <details className="howto">
          <summary>Connecter un compte marchand, étape par étape</summary>
          <ol>
            <li>
              Ouvrez le compte marchand chez le prestataire choisi et récupérez
              les clés de l’API.
            </li>
            <li>
              Dans Cloudflare : Workers &amp; Pages → <code>express-congo</code>{" "}
              → Paramètres → Variables et secrets → Ajouter, type « Secret »,
              avec les noms indiqués ci-dessus.
            </li>
            <li>
              Redéployez le Worker : le prestataire passe à « Clés détectées ».
            </li>
            <li>
              L’activation du paiement en ligne (création du paiement et
              confirmation par webhook) est ensuite branchée et testée par
              Agence Élite avant ouverture aux clients.
            </li>
          </ol>
        </details>
      </section>
    </div>
  );
}
