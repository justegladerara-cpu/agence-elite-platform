"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flap, useReducedMotion } from "./flap";

/*
 * Carte en projection équirectangulaire (x = (lon + 22) × 13, y = (52 − lat) × 9).
 * Côte atlantique de la Manche à l’Angola, villes à leurs coordonnées réelles.
 * Les trajets sont schématiques : aucun itinéraire réel de compagnie n’est affiché.
 */
const COAST =
  "M338.0 0.9C333.7 2.3 317.2 6.5 312.0 9.0C306.8 11.5 310.9 13.9 306.8 16.2C302.7 18.4 294.2 21.6 287.3 22.5C280.4 23.4 275.4 19.9 265.2 21.6C255.0 23.2 227.5 28.8 226.2 32.4C224.9 36.0 250.0 39.7 257.4 43.2C264.8 46.6 268.5 49.2 270.4 53.1C272.4 57.0 270.4 62.5 269.1 66.6C267.8 70.6 268.4 75.8 262.6 77.4C256.8 79.1 247.4 77.0 234.0 76.5C220.6 76.0 193.3 73.8 182.0 74.7C170.7 75.6 168.1 78.2 166.4 81.9C164.7 85.7 172.0 90.9 171.6 97.2C171.2 103.5 164.0 113.4 163.8 119.7C163.6 126.0 162.9 131.8 170.3 135.0C177.7 138.2 200.8 137.1 208.0 138.6C215.2 140.1 213.0 142.8 213.2 144.0C213.4 145.2 211.9 142.8 209.3 145.8C206.7 148.8 205.6 153.9 197.6 162.0C189.6 170.1 171.4 185.4 161.2 194.4C151.0 203.4 144.3 211.1 136.5 216.0C128.7 220.9 123.9 217.6 114.4 224.1C104.9 230.6 87.5 245.6 79.3 254.7C71.1 263.9 65.2 270.6 65.0 279.0C64.8 287.4 76.9 297.6 78.0 305.1C79.1 312.6 74.8 318.9 71.5 324.0C68.2 329.1 58.9 330.4 58.5 335.7C58.1 340.9 64.8 350.7 68.9 355.5C73.0 360.3 76.7 360.0 83.2 364.5C89.7 369.0 102.7 377.9 107.9 382.5C113.1 387.1 109.6 388.5 114.4 392.4C119.2 396.3 127.4 400.5 136.5 405.9C145.6 411.3 160.3 421.1 169.0 424.8C177.7 428.6 177.7 429.0 188.5 428.4C199.3 427.8 222.1 421.8 234.0 421.2C245.9 420.6 250.9 425.4 260.0 424.8C269.1 424.2 281.7 419.5 288.6 417.6C295.5 415.6 296.8 414.1 301.6 413.1C306.4 412.0 312.4 411.8 317.2 411.3C322.0 410.9 324.6 409.5 330.2 410.4C335.8 411.3 345.4 413.6 351.0 416.7C356.6 419.8 359.2 427.4 364.0 429.3C368.8 431.2 374.2 428.9 379.6 428.4C385.0 428.0 391.1 426.0 396.5 426.6C401.9 427.2 409.3 429.6 412.1 432.0C414.9 434.4 413.6 436.5 413.4 441.0C413.2 445.5 411.7 455.1 410.8 459.0C409.9 462.9 409.9 461.9 408.2 464.4C406.5 467.0 400.0 470.0 400.4 474.3C400.8 478.6 406.0 485.7 410.8 490.5C415.6 495.3 424.1 499.7 429.0 503.1C433.9 506.5 437.6 508.0 440.2 511.0C442.8 514.0 441.7 515.1 444.6 521.1C447.5 527.1 454.6 540.3 457.6 547.2C460.6 554.1 461.9 560.0 462.8 562.5";
const AIR_BZV =
  "M316.6 28.3C331.0 64.1 375.0 163.3 403.0 243.0C431.0 322.7 470.9 462.5 484.5 506.4";
const AIR_PNR =
  "M316.6 28.3C325.5 65.6 349.9 171.5 370.5 252.0C391.1 332.5 428.6 467.8 440.2 511.0";
const SEA =
  "M316.6 28.3C311.7 27.3 306.5 21.5 287.3 22.5C268.1 23.5 227.7 21.4 201.5 34.2C175.3 46.9 149.5 74.7 130.0 99.0C110.5 123.3 104.0 151.5 84.5 180.0C65.0 208.5 24.9 240.0 13.0 270.0C1.1 300.0 0.0 333.0 13.0 360.0C26.0 387.0 56.3 416.2 91.0 432.0C125.7 447.8 179.8 446.7 221.0 454.5C262.2 462.3 306.6 471.1 338.0 478.8C369.4 486.5 392.5 495.0 409.5 500.4C426.5 505.8 435.1 509.2 440.2 511.0";
const CITIES = [
  { code: "PAR", name: "Paris", x: 316.6, y: 28.3, side: "end" as const },
  {
    code: "BZV",
    name: "Brazzaville",
    x: 484.5,
    y: 506.4,
    side: "start" as const,
  },
  {
    code: "PNR",
    name: "Pointe-Noire",
    x: 440.2,
    y: 511.0,
    side: "end" as const,
  },
];

type Mode = "aerien" | "maritime" | "conteneur";
const MODES: { id: Mode; label: string }[] = [
  { id: "aerien", label: "Aérien" },
  { id: "maritime", label: "Maritime" },
  { id: "conteneur", label: "Conteneur" },
];

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

/* Pictogrammes dessinés, centrés sur l’origine, orientés vers la droite. */
function Plane() {
  return (
    <path
      d="M12 0 L4 -2 L-1 -10 L-4 -10 L-1 -2 L-8 -2 L-10 -6 L-12 -6 L-11 0 L-12 6 L-10 6 L-8 2 L-1 2 L-4 10 L-1 10 L4 2 Z"
      fill="#fff"
    />
  );
}
function Ship({ big }: { big?: boolean }) {
  return (
    <g fill="#fff">
      <path d="M-13 1 L13 1 L9 7 L-10 7 Z" />
      <rect
        x={-9}
        y={-5}
        width={big ? 16 : 7}
        height={5}
        rx={1}
        fill="#ff4b53"
      />
      {big && (
        <rect x={-6} y={-10} width={10} height={4.5} rx={1} fill="#f2b544" />
      )}
      <rect x={big ? 8 : 0} y={-7} width={3} height={7} />
    </g>
  );
}

function Vehicle({
  path,
  dur,
  begin,
  children,
}: {
  path: string;
  dur: number;
  begin: number;
  children: React.ReactNode;
}) {
  return (
    <g>
      {children}
      <animateMotion
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        rotate="auto"
        path={path}
        keyPoints="0;1"
        keyTimes="0;1"
        calcMode="spline"
        keySplines="0.45 0 0.35 1"
      />
    </g>
  );
}

export function RouteHero() {
  const reduced = useReducedMotion();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("aerien");
  const [kg, setKg] = useState(23);
  const [ref, setRef] = useState("");

  const board = useMemo(() => {
    if (mode === "aerien")
      return {
        route: "PAR→BZV/PNR",
        line: "COLIS AU KILO",
        price: euros(kg * 1300),
        unit: `${kg} kg × 13 € TTC`,
      };
    if (mode === "maritime")
      return {
        route: "PAR→PNR",
        line: "GROUPAGE",
        price: "800 €",
        unit: "pour 1 m³ en groupage, devis au-delà",
      };
    return {
      route: "PAR→PNR",
      line: "CONTENEUR",
      price: "SUR DEVIS",
      unit: "projet de chargement complet",
    };
  }, [mode, kg]);

  const routes = mode === "aerien" ? [AIR_BZV, AIR_PNR] : [SEA];

  return (
    <section className="xh" aria-labelledby="xh-title">
      <div className="xh-sky" aria-hidden />
      <div className="container xh-grid">
        <div className="xh-copy">
          <h1 id="xh-title">
            <span className="xh-line">De Paris</span>
            <span className="xh-line">à Brazzaville</span>
            <span className="xh-line">et Pointe‑Noire.</span>
          </h1>
          <p className="xh-lead">
            Colis, cartons, palettes ou conteneur complet : choisissez le mode,
            voyez le prix de la grille, puis recevez une proposition écrite
            avant tout dépôt.
          </p>
          <div className="xh-actions">
            <Link className="button xh-cta" href={`/devis?service=${mode}`}>
              Demander un devis{" "}
              {mode === "aerien"
                ? "aérien"
                : mode === "maritime"
                  ? "maritime"
                  : "conteneur"}
            </Link>
            <Link className="xh-ghost" href="/tarifs">
              Voir toute la grille
            </Link>
          </div>
          <form
            className="xh-track"
            role="search"
            aria-label="Suivre un envoi"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(
                ref.trim()
                  ? `/suivi/?ref=${encodeURIComponent(ref.trim())}`
                  : "/suivi/",
              );
            }}
          >
            <label htmlFor="xh-ref">Suivre un envoi</label>
            <div className="xh-track-row">
              <input
                id="xh-ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="Référence de l’expédition"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit">Suivre</button>
            </div>
          </form>
        </div>

        <div className="xh-stage">
          <div
            className="xh-modes"
            role="radiogroup"
            aria-label="Mode de transport"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={mode === m.id ? "on" : ""}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
            <span
              className="xh-modes-pill"
              aria-hidden
              style={{
                transform: `translateX(${MODES.findIndex((m) => m.id === mode) * 100}%)`,
              }}
            />
          </div>

          <svg
            className={"xh-map mode-" + mode}
            viewBox="0 0 572 560"
            role="img"
            aria-label={
              mode === "aerien"
                ? "Liaison aérienne de Paris vers Brazzaville et Pointe-Noire"
                : "Liaison maritime de la France vers Pointe-Noire, le long de la côte atlantique"
            }
          >
            <defs>
              <pattern
                id="xh-dots"
                width="13"
                height="13"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1.5" cy="1.5" r="1" fill="#2c4a86" />
              </pattern>
              <linearGradient id="xh-trail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff4b53" stopOpacity="0.15" />
                <stop offset="1" stopColor="#ff4b53" />
              </linearGradient>
            </defs>
            <rect
              width="572"
              height="560"
              fill="url(#xh-dots)"
              opacity="0.55"
            />
            <line x1="0" x2="572" y1="468" y2="468" className="xh-eq" />
            <text x="566" y="460" textAnchor="end" className="xh-eq-label">
              Équateur
            </text>
            <path d={COAST} className="xh-coast" />
            <text x="40" y="150" className="xh-sea-label">
              Océan Atlantique
            </text>
            {routes.map((d, i) => (
              <g key={mode + i}>
                <path d={d} className="xh-route-base" />
                <path d={d} className="xh-route" pathLength={1} />
              </g>
            ))}
            {!reduced &&
              (mode === "aerien" ? (
                <>
                  <Vehicle path={AIR_BZV} dur={7} begin={0}>
                    <Plane />
                  </Vehicle>
                  <Vehicle path={AIR_PNR} dur={7} begin={-3.5}>
                    <g transform="scale(0.8)">
                      <Plane />
                    </g>
                  </Vehicle>
                </>
              ) : (
                <Vehicle
                  path={SEA}
                  dur={mode === "maritime" ? 14 : 18}
                  begin={0}
                >
                  <Ship big={mode === "conteneur"} />
                </Vehicle>
              ))}
            {CITIES.map((c) => (
              <g key={c.code} className="xh-city">
                <circle cx={c.x} cy={c.y} r="16" className="xh-pulse" />
                <circle cx={c.x} cy={c.y} r="5.5" fill="#fff" />
                <text
                  x={c.x + (c.side === "end" ? -14 : 14)}
                  y={c.y - (c.code === "PAR" ? -22 : 14)}
                  textAnchor={c.side}
                  className="xh-city-code"
                >
                  {c.code}
                </text>
                <text
                  x={c.x + (c.side === "end" ? -14 : 14)}
                  y={c.y - (c.code === "PAR" ? -38 : -2)}
                  textAnchor={c.side}
                  className="xh-city-name"
                >
                  {c.name}
                </text>
              </g>
            ))}
          </svg>

          <div className="xh-board" aria-live="polite">
            <div className="xh-board-row">
              <span className="xh-board-key">Liaison</span>
              <Flap value={board.route} width={11} />
            </div>
            <div className="xh-board-row">
              <span className="xh-board-key">Offre</span>
              <Flap value={board.line} width={13} />
            </div>
            <div className="xh-board-row xh-board-price">
              <span className="xh-board-key">Prix</span>
              <Flap value={board.price} width={9} className="big" />
            </div>
            <p className="xh-board-unit">{board.unit}</p>
            {mode === "aerien" && (
              <label className="xh-weight">
                <span>Poids de l’envoi</span>
                <input
                  type="range"
                  min={1}
                  max={150}
                  value={kg}
                  onChange={(e) => setKg(Number(e.target.value))}
                  aria-valuetext={`${kg} kilos`}
                  style={{ ["--p" as string]: `${((kg - 1) / 149) * 100}%` }}
                />
                <output>{kg} kg</output>
              </label>
            )}
            <p className="xh-board-note">
              Grille Express Congo, prix TTC. Le montant final figure dans votre
              proposition après pesée en agence.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
