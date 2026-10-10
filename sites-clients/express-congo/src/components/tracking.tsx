"use client";
import { useEffect, useState } from "react";
import type { PublicTracking } from "@/server/tracking";

/* Étapes affichées au public, dans l’ordre du parcours. */
const steps = [
  ["cree", "Dossier ouvert"],
  ["recu-en-agence", "Reçu en agence"],
  ["en-attente-de-depart", "Prêt au départ"],
  ["expedie", "Expédié"],
  ["arrive", "Arrivé au Congo"],
  ["disponible-au-retrait", "Disponible au retrait"],
  ["remis", "Remis"],
] as const;
const labels: Record<string, string> = {
  cree: "Dossier ouvert",
  "recu-en-agence": "Reçu en agence",
  controle: "Contrôlé en agence",
  "en-attente-de-depart": "En attente de départ",
  expedie: "Expédié",
  arrive: "Arrivé à destination",
  "formalites-en-cours": "Formalités en cours",
  "disponible-au-retrait": "Disponible au retrait",
  remis: "Remis au destinataire",
  incident: "Incident signalé — contactez l’agence",
  "en-attente-information": "En attente d’information de votre part",
  annule: "Annulé",
};
/* Rang d’un état dans la frise ; les états intermédiaires prennent l’étape précédente. */
const rank: Record<string, number> = {
  cree: 0,
  "recu-en-agence": 1,
  controle: 1,
  "en-attente-de-depart": 2,
  expedie: 3,
  arrive: 4,
  "formalites-en-cours": 4,
  "disponible-au-retrait": 5,
  remis: 6,
};
const services: Record<string, string> = {
  aerien: "Fret aérien",
  maritime: "Fret maritime",
  conteneur: "Conteneur complet",
};
const when = (v: string, time = true) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    ...(time ? { timeStyle: "short" } : {}),
    timeZone: "Africa/Brazzaville",
  }).format(new Date(v));

export function TrackingForm() {
  const [reference, setReference] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<PublicTracking | null>(null);

  async function look(ref: string, c: string) {
    setBusy(true);
    setError("");
    const r = await fetch("/api/suivi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: ref, code: c }),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setResult(data as PublicTracking);
    else {
      setResult(null);
      setError(data.message || "La recherche n’a pas abouti.");
    }
  }
  /* Lien partagé par l’agence : la recherche se lance d’elle-même. */
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const ref = q.get("ref"),
      c = q.get("code");
    // Mise à jour différée d’un tour : l’URL n’est lisible qu’après hydratation.
    if (ref && c)
      void Promise.resolve().then(() => {
        setReference(ref);
        setCode(c.toUpperCase());
        return look(ref, c);
      });
    // Référence seule (saisie sur l’accueil) : on la reprend et on attend le code.
    else if (ref)
      void Promise.resolve().then(() => {
        setReference(ref);
        document.getElementById("suivi-code")?.focus();
      });
  }, []);

  const current = result ? (rank[result.status] ?? -1) : -1;
  const off =
    result &&
    ["incident", "en-attente-information", "annule"].includes(result.status);
  return (
    <div className="tracking">
      <form
        className="tracking-form card"
        onSubmit={(e) => {
          e.preventDefault();
          void look(reference, code);
        }}
      >
        <div className="tracking-fields">
          <label>
            Référence de l’expédition
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Référence indiquée par l’agence"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <label>
            Code de suivi
            <input
              id="suivi-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              required
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Recherche…" : "Suivre mon envoi"}
          </button>
        </div>
        <p className="hint">
          La référence et le code figurent sur le récapitulatif remis par votre
          agence. Aucune donnée personnelle n’est affichée sur cette page.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>

      {result && (
        <section className="tracking-result card" aria-live="polite">
          <header className="tracking-head">
            <div>
              <span className="eyebrow">
                {services[result.service] || result.service} · France →{" "}
                {result.destination}
              </span>
              <h2>{labels[result.status] || result.status}</h2>
              <p className="ref">{result.reference}</p>
            </div>
            <dl className="tracking-facts">
              <div>
                <dt>Colis</dt>
                <dd>{result.parcels || "—"}</dd>
              </div>
              <div>
                <dt>Départ</dt>
                <dd>
                  {result.departure
                    ? `${when(result.departure.scheduledAt, false)}${result.departure.confirmed ? "" : " (prévisionnel)"}`
                    : "À programmer"}
                </dd>
              </div>
            </dl>
          </header>
          {off && (
            <p className="notice">
              {labels[result.status]}. Votre agence reste votre interlocutrice
              pour la suite du dossier.
            </p>
          )}
          <ol className="stepper" aria-label="Avancement">
            {steps.map(([key, label], i) => (
              <li
                key={key}
                className={
                  i < current ? "done" : i === current ? "current" : ""
                }
                aria-current={i === current ? "step" : undefined}
              >
                <i aria-hidden />
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <h3>Historique</h3>
          <ol className="timeline public">
            {result.events
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i}>
                  <b>{labels[e.status] || e.status}</b>
                  <span>{when(e.at)}</span>
                  {e.location && <small>{e.location}</small>}
                </li>
              ))}
          </ol>
          <p className="hint">
            Heures affichées à l’heure du Congo. Les dates de départ restent
            indicatives tant qu’elles ne sont pas confirmées.
          </p>
        </section>
      )}
    </div>
  );
}
