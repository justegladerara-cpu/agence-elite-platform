"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicTracking } from "@/server/tracking";
import { LiveJourney } from "./live-journey";

const POLL_MS = 5000;
const AGENCY_WHATSAPP = "33621933298";
const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `il y a ${s} s` : `il y a ${Math.floor(s / 60)} min`;
};

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
    [result, setResult] = useState<PublicTracking | null>(null),
    [fresh, setFresh] = useState<string[]>([]),
    [toast, setToast] = useState(""),
    [checkedAt, setCheckedAt] = useState(0),
    [clock, setClock] = useState(0),
    [sample, setSample] = useState<{ reference: string; code: string } | null>(
      null,
    );
  const query = useRef({ reference: "", code: "" });
  const shownRef = useRef<PublicTracking | null>(null);
  useEffect(() => {
    shownRef.current = result;
  }, [result]);

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
    if (r.ok) {
      query.current = { reference: ref, code: c };
      setFresh([]);
      setResult(data as PublicTracking);
      setCheckedAt(Date.now());
    } else {
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

  /* Dossier de démonstration proposé quand on n’a pas de référence. */
  useEffect(() => {
    void fetch("/api/suivi")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSample(d))
      .catch(() => {});
  }, []);

  /* Suivi en direct : nouvelle lecture toutes les 5 s quand la page est visible. */
  const version = result?.version;
  useEffect(() => {
    if (!version) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/suivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...query.current, live: true }),
      }).catch(() => null);
      if (!r?.ok || stopped) return;
      const next = (await r.json()) as PublicTracking;
      setCheckedAt(Date.now());
      const prev = shownRef.current;
      if (!prev || prev.version === next.version) return;
      const known = new Set(prev.events.map((e) => e.status + e.at));
      const added = next.events.filter((e) => !known.has(e.status + e.at));
      setFresh(added.map((e) => e.status + e.at));
      if (added.length)
        setToast(
          "Nouvelle étape : " +
            (labels[added[added.length - 1].status] ||
              added[added.length - 1].status),
        );
      setResult(next);
    };
    const id = setInterval(() => void tick(), POLL_MS);
    const clockId = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(id);
      clearInterval(clockId);
    };
  }, [version]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);

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
        {sample && !result && (
          <button
            type="button"
            className="sample-button"
            onClick={() => {
              setReference(sample.reference);
              setCode(sample.code);
              void look(sample.reference, sample.code);
            }}
          >
            <span className="lj-live">En direct</span>
            Essayer avec un dossier de démonstration qui avance toutes les
            minutes
          </button>
        )}
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
              <h2 key={result.status} className="status-flip">
                {labels[result.status] || result.status}
              </h2>
              <p className="ref">{result.reference}</p>
              <p className="live-line" aria-live="off">
                <span className="live-dot" aria-hidden />
                Suivi en direct, actualisé{" "}
                {ago((clock || checkedAt) - checkedAt)}
              </p>
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
          <LiveJourney
            service={result.service}
            destination={result.destination}
            status={result.status}
            transit={result.transit}
            live={result.live}
          />
          <ol
            className="stepper animated"
            aria-label="Avancement"
            style={{
              ["--progress" as string]: `${Math.max(0, current) / (steps.length - 1)}`,
            }}
          >
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
              .map((e) => (
                <li
                  key={e.status + e.at}
                  className={fresh.includes(e.status + e.at) ? "fresh" : ""}
                >
                  <b>{labels[e.status] || e.status}</b>
                  <span>{when(e.at)}</span>
                  {e.location && <small>{e.location}</small>}
                </li>
              ))}
          </ol>
          <div className="tracking-actions">
            <a
              className="button small whatsapp"
              href={`https://wa.me/${AGENCY_WHATSAPP}?text=${encodeURIComponent(`Bonjour Express Congo, j’ai une question sur mon envoi ${result.reference}.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Écrire à l’agence sur WhatsApp
            </a>
            <button
              type="button"
              className="button small secondary"
              onClick={() => {
                const url = `${location.origin}/suivi/?ref=${encodeURIComponent(result.reference)}&code=${encodeURIComponent(query.current.code)}`;
                if (navigator.share)
                  void navigator
                    .share({ title: "Suivi Express Congo", url })
                    .catch(() => {});
                else
                  void navigator.clipboard
                    ?.writeText(url)
                    .then(() => setToast("Lien de suivi copié"));
              }}
            >
              Partager le suivi
            </button>
          </div>
          <p className="hint">
            Heures affichées à l’heure du Congo. Les dates de départ restent
            indicatives tant qu’elles ne sont pas confirmées.
            {result.live &&
              " Ce dossier de démonstration avance tout seul d’une étape par minute environ."}
          </p>
        </section>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
