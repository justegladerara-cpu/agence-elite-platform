"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { QuoteInput, validateQuote } from "@/domain/quotes";
import { emptyParcel, volume } from "@/domain/measurements";
import { ParcelFields } from "./parcel-fields";
import { Illustration, type IllustrationName } from "./illustrations";

/* Illustration de chaque étape, et choix présentés en cartes. */
const stepArt: IllustrationName[] = [
  "colis",
  "metre",
  "agence",
  "message",
  "douane",
];
const kinds: [QuoteInput["kind"], string, IllustrationName][] = [
  ["particulier", "Un particulier", "famille"],
  ["professionnel", "Un professionnel", "entreprise"],
];
const servicesChoice: [
  QuoteInput["service"],
  string,
  string,
  IllustrationName,
][] = [
  ["aerien", "Fret aérien", "13 € le kilo, avec douane", "avion"],
  ["maritime", "Fret maritime", "800 € pour 1 m³ en groupage", "navire"],
  ["conteneur", "Conteneur complet", "Sur devis", "conteneur"],
  ["conseil", "Aidez-moi à choisir", "Un conseiller vous oriente", "message"],
];
const destinations: [QuoteInput["destination"], IllustrationName][] = [
  ["Brazzaville", "brazzaville"],
  ["Pointe-Noire", "pointe-noire"],
];
const euro = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

/** Estimation indicative tirée de la grille, ou null si le prix est sur devis. */
function estimate(q: QuoteInput, m3: number) {
  const kg = q.parcels.reduce(
    (s, p) =>
      s +
      (Number(String(p.weight).replace(",", ".")) || 0) *
        (Number(p.quantity) || 0),
    0,
  );
  if (q.service === "aerien" && kg > 0)
    return {
      price: euro(Math.ceil(kg) * 1300),
      basis: `${Math.ceil(kg)} kg × 13 €`,
    };
  if (q.service === "maritime" && m3 > 0 && m3 <= 1)
    return { price: euro(80000), basis: "groupage jusqu’à 1 m³" };
  return null;
}
const initial: QuoteInput = {
  kind: "particulier",
  service: "conseil",
  destination: "Brazzaville",
  description: "",
  parcels: [emptyParcel()],
  customs: "à préciser",
  desiredDate: "",
  agency: "paris",
  city: "",
  name: "",
  email: "",
  phone: "",
  channel: "email",
  comment: "",
  frequency: "",
  constraints: "",
  privacy: false,
  marketing: false,
};
const steps = [
  "Votre besoin",
  "Les marchandises",
  "Le dépôt",
  "Vos coordonnées",
  "Récapitulatif",
];
export function QuoteForm({
  professional = false,
}: {
  professional?: boolean;
}) {
  const [q, setQ] = useState<QuoteInput>({
      ...initial,
      kind: professional ? "professionnel" : "particulier",
    }),
    [step, setStep] = useState(0),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reference, setReference] = useState(""),
    [direction, setDirection] = useState<"forward" | "back">("forward");
  const key = useRef("");
  const files = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    key.current = crypto.randomUUID();
    const raw = sessionStorage.getItem("ec-parcels");
    const draft = sessionStorage.getItem("ec-quote-draft");
    try {
      // Session storage is an external browser source, read only after hydration.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (draft)
        setQ((old) => ({
          ...old,
          ...JSON.parse(draft),
          name: "",
          email: "",
          phone: "",
          comment: "",
          privacy: false,
        }));
      if (raw) {
        setQ((old) => ({ ...old, parcels: JSON.parse(raw) }));
        sessionStorage.removeItem("ec-parcels");
      }
      const s = new URLSearchParams(location.search).get("service");
      if (["aerien", "maritime", "conteneur", "conseil"].includes(s || ""))
        setQ((old) => ({ ...old, service: s as QuoteInput["service"] }));
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      sessionStorage.removeItem("ec-quote-draft");
    }
  }, []);
  function change<K extends keyof QuoteInput>(field: K, value: QuoteInput[K]) {
    setQ({ ...q, [field]: value });
    const nextErrors = { ...errors };
    for (const key of Object.keys(nextErrors))
      if (key === field || key.startsWith(field + ".")) delete nextErrors[key];
    setErrors(nextErrors);
  }
  function field(field: keyof QuoteInput, label: string, type = "text") {
    return (
      <label htmlFor={`quote-${field}`}>
        {label}
        <input
          id={`quote-${field}`}
          type={type}
          aria-label={label}
          value={String(q[field])}
          aria-invalid={!!errors[field]}
          aria-describedby={errors[field] ? `error-${field}` : undefined}
          onChange={(e) => change(field, e.target.value as never)}
        />
        {errors[field] && (
          <small className="error" id={`error-${field}`}>
            {errors[field]}
          </small>
        )}
      </label>
    );
  }
  function next() {
    const all = validateQuote(q);
    const relevant = [
      ["kind", "service", "destination"],
      ["description", "parcels", "desiredDate"],
      ["agency", "city"],
      ["name", "phone", "email", "channel"],
      ["privacy"],
    ][step];
    const current = Object.fromEntries(
      Object.entries(all).filter(([k]) =>
        relevant.some((r) => k === r || k.startsWith(r + ".")),
      ),
    );
    setErrors(current);
    if (!Object.keys(current).length) {
      setDirection("forward");
      setStep(step + 1);
      setTimeout(() => heading.current?.focus(), 0);
    }
  }
  function save() {
    const {
      kind,
      service,
      destination,
      parcels,
      agency,
      customs,
      desiredDate,
    } = q;
    sessionStorage.setItem(
      "ec-quote-draft",
      JSON.stringify({
        kind,
        service,
        destination,
        parcels,
        agency,
        customs,
        desiredDate,
      }),
    );
    setMessage(
      "Caractéristiques de l’envoi sauvegardées dans cet onglet. Les coordonnées et documents ne sont pas conservés.",
    );
  }
  async function submit() {
    const invalid = validateQuote(q);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setMessage("Vérifiez les champs des étapes précédentes.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("payload", JSON.stringify(q));
      for (const f of Array.from(files.current?.files || []))
        body.append("documents", f);
      const response = await fetch("/api/devis", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors(data.errors || {});
        throw new Error(data.message);
      }
      setReference(data.reference);
      sessionStorage.removeItem("ec-quote-draft");
    } catch (e) {
      setMessage(
        (e as Error).message ||
          "Connexion interrompue. Réessayez : votre demande ne sera pas dupliquée.",
      );
    } finally {
      setBusy(false);
    }
  }
  let m3 = 0;
  try {
    m3 = Number(volume(q.parcels));
  } catch {
    m3 = 0;
  }
  const guess = estimate(q, m3);
  if (reference)
    return (
      <div className="card confirmation done-card" role="status">
        <div className="confetti" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: i }} />
          ))}
        </div>
        <Illustration name="succes" className="done-art" />
        <h2>Votre demande est enregistrée</h2>
        <p className="done-ref">
          Référence <strong>{reference}</strong>
        </p>
        <ol className="done-next">
          <li>L’équipe étudie votre demande.</li>
          <li>Vous recevez une proposition écrite et détaillée.</li>
          <li>
            Vous déposez vos colis à l’agence, puis suivez l’envoi en direct.
          </li>
        </ol>
        <p className="hint">
          Aucun email n’a été envoyé : en démonstration, cette demande ne
          constitue pas une réservation.
        </p>
        <div className="actions">
          <a
            className="button whatsapp"
            href={`https://wa.me/33621933298?text=${encodeURIComponent(`Bonjour Express Congo, je viens d’envoyer la demande de devis ${reference}.`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Prévenir l’agence sur WhatsApp
          </a>
          <Link className="button secondary" href="/">
            Revenir à l’accueil
          </Link>
        </div>
      </div>
    );
  return (
    <div className="quote-layout">
      <aside className="quote-aside">
        <div className="quote-art" key={step}>
          <Illustration name={stepArt[step]} />
        </div>
        <h2>Un envoi bien préparé commence ici.</h2>
        <div className="quote-summary" aria-live="polite">
          <p>
            <span>Solution</span>
            <b>{servicesChoice.find(([k]) => k === q.service)?.[1] ?? "—"}</b>
          </p>
          <p>
            <span>Trajet</span>
            <b>France vers {q.destination}</b>
          </p>
          <p>
            <span>Volume</span>
            <b>
              {m3 > 0
                ? `${m3.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} m³`
                : "—"}
            </b>
          </p>
          <p className="quote-price">
            <span>Estimation</span>
            <b key={guess?.price ?? "devis"}>
              {guess ? guess.price : "Sur devis"}
            </b>
            {guess && <small>{guess.basis}, grille Express Congo</small>}
          </p>
        </div>
        <ol>
          {steps.map((s, i) => (
            <li key={s} aria-current={step === i ? "step" : undefined}>
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="muted">
          Démonstration : utilisez des coordonnées fictives.
        </p>
      </aside>
      <section className="card quote-card">
        <div
          className="quote-progress"
          role="progressbar"
          aria-label="Progression de la demande"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={step + 1}
        >
          <i style={{ width: `${((step + 1) / 5) * 100}%` }} />
        </div>
        <p className="eyebrow">Étape {step + 1} sur 5</p>
        <h2 ref={heading} tabIndex={-1}>
          {steps[step]}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 4) next();
            else void submit();
          }}
          noValidate
          className={"quote-step " + direction}
          key={step}
        >
          {step === 0 && (
            <>
              <fieldset className="choices two">
                <legend>Vous êtes</legend>
                {kinds.map(([value, label, art]) => (
                  <label key={value} className="choice">
                    <input
                      type="radio"
                      name="kind"
                      value={value}
                      checked={q.kind === value}
                      onChange={() => change("kind", value)}
                    />
                    <Illustration name={art} animated={q.kind === value} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="choices four">
                <legend>Solution recherchée</legend>
                {servicesChoice.map(([value, label, hint, art]) => (
                  <label key={value} className="choice">
                    <input
                      type="radio"
                      name="service"
                      value={value}
                      checked={q.service === value}
                      onChange={() => change("service", value)}
                    />
                    <Illustration name={art} animated={q.service === value} />
                    <span>{label}</span>
                    <small>{hint}</small>
                  </label>
                ))}
              </fieldset>
              <fieldset className="choices two">
                <legend>Destination, depuis la France</legend>
                {destinations.map(([value, art]) => (
                  <label key={value} className="choice">
                    <input
                      type="radio"
                      name="destination"
                      value={value}
                      checked={q.destination === value}
                      onChange={() => change("destination", value)}
                    />
                    <Illustration
                      name={art}
                      animated={q.destination === value}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 1 && (
            <>
              {field("description", "Nature des marchandises")}
              <ParcelFields
                parcels={q.parcels}
                onChange={(p) => change("parcels", p)}
                showErrors={Object.keys(errors).some((k) =>
                  k.startsWith("parcels"),
                )}
              />
              <button
                type="button"
                className="text-button"
                disabled={q.parcels.length >= 50}
                onClick={() => change("parcels", [...q.parcels, emptyParcel()])}
              >
                + Ajouter une ligne
              </button>
              {field("desiredDate", "Date souhaitée (non confirmée)", "date")}
              <label>
                Traitement douanier
                <select
                  value={q.customs}
                  onChange={(e) => change("customs", e.target.value)}
                >
                  <option>à préciser</option>
                  <option>demande avec dédouanement</option>
                  <option>demande sans dédouanement</option>
                </select>
              </label>
              {q.kind === "professionnel" && (
                <>
                  {field("frequency", "Fréquence d’envoi souhaitée")}
                  {field(
                    "constraints",
                    "Contraintes et besoins professionnels",
                  )}
                </>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p>
                Le dépôt en agence est une option à confirmer. L’enlèvement et
                la livraison à domicile ne sont pas activés.
              </p>
              <label>
                Agence préférée
                <select
                  value={q.agency}
                  onChange={(e) =>
                    change("agency", e.target.value as QuoteInput["agency"])
                  }
                >
                  <option value="paris">Paris</option>
                  <option value="brazzaville">Brazzaville</option>
                  <option value="pointe-noire">Pointe-Noire</option>
                </select>
              </label>
              {field("city", "Votre ville")}
            </>
          )}
          {step === 3 && (
            <>
              {field("name", "Nom et prénom")}
              {field("phone", "Téléphone avec indicatif", "tel")}
              {field("email", "Email", "email")}
              <label>
                Canal de réponse
                <select
                  value={q.channel}
                  onChange={(e) =>
                    change("channel", e.target.value as QuoteInput["channel"])
                  }
                >
                  <option value="email">Email</option>
                  <option value="telephone">Téléphone</option>
                </select>
              </label>
              <label>
                Commentaire
                <textarea
                  value={q.comment}
                  maxLength={2000}
                  onChange={(e) => change("comment", e.target.value)}
                />
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <dl className="recap">
                <dt>Service</dt>
                <dd>{q.service}</dd>
                <dt>Destination</dt>
                <dd>France → {q.destination}, République du Congo</dd>
                <dt>Marchandises</dt>
                <dd>{q.description}</dd>
                <dt>Volume total</dt>
                <dd>
                  {(() => {
                    try {
                      return volume(q.parcels).replace(".", ",") + " m³";
                    } catch {
                      return "Mesures à corriger";
                    }
                  })()}
                </dd>
                <dt>Contact</dt>
                <dd>
                  {q.name} · {q.email} · {q.phone}
                </dd>
                <dt>Prix</dt>
                <dd>Devis nécessaire</dd>
              </dl>
              <label>
                Pièces jointes (facultatif)
                <input
                  ref={files}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                />
                <small>
                  3 fichiers, 5 Mo par fichier et 10 Mo au total. Stockés en
                  quarantaine, indisponibles tant que l’analyse n’est pas
                  connectée. Aucune pièce d’identité.
                </small>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={q.privacy}
                  aria-describedby="error-privacy"
                  onChange={(e) => change("privacy", e.target.checked)}
                />
                J’ai lu l’information sur le traitement de cette demande dans la{" "}
                <Link href="/confidentialite">
                  politique de confidentialité
                </Link>
                .
              </label>
              {errors.privacy && (
                <small className="error" id="error-privacy">
                  {errors.privacy}
                </small>
              )}
              <p>
                Cette démonstration ne collecte aucune inscription marketing.
                L’enregistrement ne confirme ni départ, ni prix, ni paiement.
              </p>
            </>
          )}
          {message && (
            <p role="alert" className="notice">
              {message}
            </p>
          )}
          <div className="actions">
            {step > 0 && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setDirection("back");
                  setStep(step - 1);
                }}
              >
                Retour
              </button>
            )}
            <button type="submit" className="button" disabled={busy}>
              {busy
                ? "Enregistrement…"
                : step === 4
                  ? "Enregistrer la demande"
                  : "Continuer"}
            </button>
          </div>
          <button type="button" className="text-button" onClick={save}>
            Sauvegarder les caractéristiques dans cet onglet
          </button>
        </form>
      </section>
    </div>
  );
}
