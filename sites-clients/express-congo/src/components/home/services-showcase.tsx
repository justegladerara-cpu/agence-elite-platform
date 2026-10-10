"use client";
import Link from "next/link";
import { useState } from "react";

/*
 * Les trois solutions, choisies comme dans une application : l’illustration
 * change avec le choix (avion qui décolle, cartons qui montent à bord,
 * conteneur levé). Contenu tiré de la grille et du site officiel.
 */
const SOLUTIONS = [
  {
    id: "aerien",
    tab: "Fret aérien",
    title: "Pour les courriers et les colis",
    text: "Courriers, téléphones, cartons et palettes. Vous payez au kilo ou à l’unité, avec dédouanement inclus dans l’offre « avec douane ».",
    facts: [
      ["10 €", "le courrier ou le téléphone"],
      ["13 €", "le kilo pour les cartons"],
      ["90 €", "frais de dossier, fret sans douane"],
    ],
    href: "/services/fret-aerien/",
    quote: "/devis?service=aerien",
  },
  {
    id: "maritime",
    tab: "Fret maritime",
    title: "Pour les cartons et les palettes",
    text: "Cartons et palettes regroupés avec d’autres envois. Mesurez vos colis : le prix dépend du volume occupé.",
    facts: [
      ["800 €", "pour 1 m³ en groupage"],
      ["Devis", "au-delà de 1 m³"],
      ["Calcul", "du volume en ligne"],
    ],
    href: "/services/fret-maritime/",
    quote: "/devis?service=maritime",
  },
  {
    id: "conteneur",
    tab: "Conteneur complet",
    title: "Un conteneur rien que pour vous",
    text: "Un chargement complet, avec le type de conteneur adapté à vos marchandises, étudié selon vos volumes et vos contraintes.",
    facts: [
      ["Devis", "selon le chargement"],
      ["Étude", "de vos marchandises"],
      ["Suivi", "jusqu’au retrait"],
    ],
    href: "/services/conteneurs-complets/",
    quote: "/devis?service=conteneur",
  },
] as const;

function Illustration({ id }: { id: string }) {
  return (
    <svg className={"xs-art art-" + id} viewBox="0 0 320 200" aria-hidden>
      <rect
        x="0"
        y="0"
        width="320"
        height="200"
        rx="18"
        className="xs-art-bg"
      />
      {id === "aerien" && (
        <g>
          <path d="M20 165 H300" className="xs-runway" />
          <path d="M40 165 H280" className="xs-runway-dash" />
          <g className="xs-plane">
            <path
              d="M0 0 L-38 -6 L-56 -30 L-66 -30 L-54 -6 L-84 -6 L-94 -20 L-102 -20 L-96 0 L-102 20 L-94 20 L-84 6 L-54 6 L-66 30 L-56 30 L-38 6 Z"
              transform="translate(190 120) rotate(-12)"
            />
          </g>
          <g className="xs-cloud">
            <ellipse cx="70" cy="50" rx="26" ry="10" />
            <ellipse cx="250" cy="70" rx="20" ry="8" />
          </g>
        </g>
      )}
      {id === "maritime" && (
        <g>
          <path
            d="M0 150 Q40 140 80 150 T160 150 T240 150 T320 150 V200 H0 Z"
            className="xs-wave"
          />
          <g className="xs-ship">
            <path d="M70 140 H250 L230 168 H92 Z" className="xs-hull" />
            {[0, 1, 2, 3, 4].map((i) => (
              <rect
                key={i}
                x={96 + i * 26}
                y={116}
                width={22}
                height={22}
                rx={3}
                className={"xs-box b" + i}
              />
            ))}
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={110 + i * 26}
                y={92}
                width={22}
                height={22}
                rx={3}
                className={"xs-box top b" + (i + 5)}
              />
            ))}
            <rect x="222" y="98" width="10" height="42" className="xs-hull" />
          </g>
        </g>
      )}
      {id === "conteneur" && (
        <g>
          <path d="M20 172 H300" className="xs-runway" />
          <path d="M60 20 V60 M60 20 H250 M250 20 V40" className="xs-crane" />
          <g className="xs-lift">
            <path d="M250 40 V70" className="xs-cable" />
            <rect
              x="170"
              y="70"
              width="160"
              height="62"
              rx="4"
              className="xs-container"
              transform="translate(-80 0)"
            />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <path key={i} d={`M${104 + i * 20} 78 V124`} className="xs-rib" />
            ))}
          </g>
          <rect
            x="70"
            y="136"
            width="200"
            height="36"
            rx="4"
            className="xs-truck"
          />
          <circle cx="100" cy="174" r="9" className="xs-wheel" />
          <circle cx="240" cy="174" r="9" className="xs-wheel" />
        </g>
      )}
    </svg>
  );
}

export function ServicesShowcase() {
  const [active, setActive] = useState<string>("aerien");
  const s = SOLUTIONS.find((x) => x.id === active)!;
  return (
    <div className="xs">
      <div
        className="xs-tabs"
        role="tablist"
        aria-label="Solutions de transport"
      >
        {SOLUTIONS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={"xs-tab-" + x.id}
            aria-selected={active === x.id}
            aria-controls="xs-panel"
            className={active === x.id ? "on" : ""}
            onClick={() => setActive(x.id)}
          >
            {x.tab}
          </button>
        ))}
      </div>
      <div
        className="xs-panel"
        id="xs-panel"
        role="tabpanel"
        aria-labelledby={"xs-tab-" + s.id}
        key={s.id}
      >
        <Illustration id={s.id} />
        <div className="xs-body">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          <dl className="xs-facts">
            {s.facts.map(([v, l]) => (
              <div key={l}>
                <dt>{v}</dt>
                <dd>{l}</dd>
              </div>
            ))}
          </dl>
          <div className="xs-actions">
            <Link className="button" href={s.quote}>
              Demander un devis
            </Link>
            <Link className="xs-more" href={s.href}>
              En savoir plus
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
