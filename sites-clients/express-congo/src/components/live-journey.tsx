"use client";
import { useEffect, useRef, useState } from "react";

/*
 * Trajet en direct : Paris à gauche, la ville d’arrivée à droite, l’avion ou
 * le navire entre les deux. Avant le départ, le véhicule attend à Paris ;
 * après l’arrivée, il est à destination ; en route, sa place est indicative
 * (temps écoulé depuis le départ rapporté à une durée habituelle) et le dit.
 * Quand l’étape change, le véhicule glisse jusqu’à sa nouvelle place.
 */
export type JourneyProps = {
  service: string;
  destination: string;
  status: string;
  transit: { departedAt: string; expectedMs: number } | null;
  live?: boolean;
  compact?: boolean;
};

const AFTER = [
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];
export function journeyProgress(p: JourneyProps, now = Date.now()) {
  if (AFTER.includes(p.status)) return 1;
  if (p.status !== "expedie") return 0;
  if (!p.transit) return 0.5;
  const r = (now - Date.parse(p.transit.departedAt)) / p.transit.expectedMs;
  return Math.min(0.94, Math.max(0.06, r));
}

const AIR = "M70 150 C 230 20, 570 20, 730 150";
const SEA = "M70 150 C 200 205, 330 120, 420 165 S 640 200, 730 150";

export function LiveJourney(props: JourneyProps) {
  const { service, destination, status, live, compact } = props;
  const path = service === "aerien" ? AIR : SEA;
  const ref = useRef<SVGPathElement>(null);
  const [now, setNow] = useState<number | null>(null);
  const target =
    now === null
      ? AFTER.includes(status)
        ? 1
        : 0
      : journeyProgress(props, now);
  const [shown, setShown] = useState(target);
  const [point, setPoint] = useState<{
    x: number;
    y: number;
    a: number;
  } | null>(null);

  // Horloge : la position indicative avance d’elle-même pendant le trajet.
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Glissement doux de l’ancienne place vers la nouvelle.
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const from = shown,
      start = performance.now(),
      dur = reduce ? 0 : 1400;
    const step = (t: number) => {
      const k = dur ? Math.min(1, (t - start) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      setShown(from + (target - from) * e);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const len = el.getTotalLength();
    const a = el.getPointAtLength(len * shown),
      b = el.getPointAtLength(Math.min(len, len * shown + 2)),
      c = el.getPointAtLength(Math.max(0, len * shown - 2));
    const angle = (Math.atan2(b.y - c.y, b.x - c.x) * 180) / Math.PI;
    const id = requestAnimationFrame(() =>
      setPoint({ x: a.x, y: a.y, a: angle }),
    );
    return () => cancelAnimationFrame(id);
  }, [shown, path]);

  const moving = status === "expedie";
  const caption =
    status === "expedie"
      ? service === "aerien"
        ? `En vol vers ${destination}. Position indicative, calculée depuis l’heure de départ.`
        : `En mer vers Pointe-Noire. Position indicative, calculée depuis le départ du navire.`
      : AFTER.includes(status)
        ? `Arrivé à ${destination}.`
        : status === "incident"
          ? "Dossier en attente à l’agence de Paris."
          : "À l’agence de Paris, en préparation du départ.";

  return (
    <figure
      className={"lj" + (compact ? " compact" : "") + (moving ? " moving" : "")}
    >
      <svg viewBox="0 0 800 220" role="img" aria-label={caption}>
        <defs>
          <pattern
            id="lj-dots"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.1" fill="#2c4a86" />
          </pattern>
        </defs>
        <rect width="800" height="220" fill="url(#lj-dots)" opacity="0.6" />
        {service !== "aerien" && (
          <g className="lj-waves" aria-hidden>
            <path d="M0 196 q 20 -8 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" />
          </g>
        )}
        <path d={path} className="lj-base" />
        <path
          ref={ref}
          d={path}
          className="lj-done"
          pathLength={1}
          style={{ strokeDashoffset: 1 - shown }}
        />
        <g className="lj-city" transform="translate(70 150)">
          <circle r="22" className={"lj-ring" + (shown < 0.02 ? " on" : "")} />
          <circle r="8" />
          <text y="44" textAnchor="middle" className="lj-code">
            PAR
          </text>
          <text y="62" textAnchor="middle" className="lj-name">
            Paris
          </text>
        </g>
        <g className="lj-city" transform="translate(730 150)">
          <circle r="22" className={"lj-ring" + (shown > 0.98 ? " on" : "")} />
          <circle r="8" />
          <text y="44" textAnchor="middle" className="lj-code">
            {destination === "Brazzaville" ? "BZV" : "PNR"}
          </text>
          <text y="62" textAnchor="middle" className="lj-name">
            {destination}
          </text>
        </g>
        {point && (
          <g
            className="lj-vehicle"
            transform={`translate(${point.x} ${point.y}) rotate(${service === "aerien" ? point.a : 0})`}
          >
            <circle r="26" className="lj-halo" />
            {service === "aerien" ? (
              <path
                d="M18 0 L6 -3 L-1 -15 L-6 -15 L-2 -3 L-12 -3 L-15 -9 L-18 -9 L-16 0 L-18 9 L-15 9 L-12 3 L-2 3 L-6 15 L-1 15 L6 3 Z"
                fill="#fff"
              />
            ) : (
              <g className="lj-boat">
                <path d="M-20 2 L20 2 L14 12 L-15 12 Z" fill="#fff" />
                <rect
                  x="-14"
                  y="-8"
                  width="9"
                  height="9"
                  rx="1.5"
                  fill="#ff4b53"
                />
                <rect
                  x="-4"
                  y="-8"
                  width="9"
                  height="9"
                  rx="1.5"
                  fill="#f2b544"
                />
                <rect
                  x="6"
                  y="-8"
                  width="7"
                  height="9"
                  rx="1.5"
                  fill="#9fb8e6"
                />
                <rect x="14" y="-14" width="3" height="16" fill="#fff" />
              </g>
            )}
          </g>
        )}
      </svg>
      <figcaption>
        {live && <span className="lj-live">En direct</span>}
        {caption}
      </figcaption>
    </figure>
  );
}
