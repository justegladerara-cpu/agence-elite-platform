import type { JSX, ReactNode } from "react";

export type IllustrationName =
  | "colis"
  | "balance"
  | "metre"
  | "avion"
  | "navire"
  | "conteneur"
  | "agence"
  | "remise"
  | "douane"
  | "suivi"
  | "message"
  | "paiement"
  | "vide"
  | "succes"
  | "paris"
  | "brazzaville"
  | "pointe-noire"
  | "famille"
  | "entreprise"
  | "calendrier";

export const illustrationNames: IllustrationName[] = [
  "colis",
  "balance",
  "metre",
  "avion",
  "navire",
  "conteneur",
  "agence",
  "remise",
  "douane",
  "suivi",
  "message",
  "paiement",
  "vide",
  "succes",
  "paris",
  "brazzaville",
  "pointe-noire",
  "famille",
  "entreprise",
  "calendrier",
];

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const NAVY = "#0B1D3F";
const BLUE = "#143F86";
const MID = "#2C4A86";
const SKY = "#9FB8E6";
const RED = "#C71922";
const CORAL = "#FF4B53";
const AMBER = "#F2B544";
const MIST = "#EEF2F7";
const LINE = "#D9DFE8";
const WHITE = "#FFFFFF";
const SKIN_A = "#6b4226";
const SKIN_B = "#8d5a3b";
const CHAT = "#25D366";
const CHAT_LIGHT = "#DCF8C6";

const OL = {
  stroke: NAVY,
  strokeWidth: 2.5,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const;

const OL2 = { ...OL, strokeWidth: 2 } as const;

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

const BLOB =
  "M121 16C171 14 213 46 216 92C219 138 182 168 126 168C70 168 24 142 24 94C24 48 68 18 121 16Z";

function Blob() {
  return <path d={BLOB} fill={MIST} />;
}

function BlobClip({ id, children }: { id: string; children: ReactNode }) {
  return (
    <>
      <defs>
        <clipPath id={id}>
          <path d={BLOB} />
        </clipPath>
      </defs>
      <Blob />
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}

function SceneClip({ id, children }: { id: string; children: ReactNode }) {
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect x="12" y="12" width="216" height="156" rx="30" />
        </clipPath>
      </defs>
      <rect x="12" y="12" width="216" height="156" rx="30" fill={MIST} />
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}

function Shadow({
  cx,
  cy,
  rx,
  ry = 5,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
}) {
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={NAVY} fillOpacity={0.09} />
  );
}

function Spark({
  x,
  y,
  s = 1,
  color = AMBER,
  cls = "i-spark",
}: {
  x: number;
  y: number;
  s?: number;
  color?: string;
  cls?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className={cls}
        d="M0 -7Q1.2 -1.2 7 0Q1.2 1.2 0 7Q-1.2 1.2 -7 0Q-1.2 -1.2 0 -7Z"
        fill={color}
      />
    </g>
  );
}

function Cloud({
  x,
  y,
  s = 1,
  cls = "i-cloud",
}: {
  x: number;
  y: number;
  s?: number;
  cls?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={cls}>
        <path
          d="M-4 0H48A10 10 0 0 0 44 -19A14 14 0 0 0 18 -24A12 12 0 0 0 -4 0Z"
          fill={WHITE}
          stroke={LINE}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

type BoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  dx?: number;
  dy?: number;
  tape?: boolean;
  label?: boolean;
  sw?: number;
  color?: string;
};

/** Cardboard box in a 3/4 oblique view: front face, lit top, shaded side. */
function Box({
  x,
  y,
  w,
  h,
  dx = 18,
  dy = 12,
  tape = true,
  label = true,
  sw = 2.5,
  color = AMBER,
}: BoxProps) {
  const front = `M${x} ${y}h${w}v${h}h${-w}Z`;
  const top = `M${x} ${y}l${dx} ${-dy}h${w}l${-dx} ${dy}Z`;
  const side = `M${x + w} ${y}l${dx} ${-dy}v${h}l${-dx} ${dy}Z`;
  const t = r1(Math.max(2.5, w * 0.08));
  const cx = r1(x + w / 2);
  return (
    <g>
      <path d={front} fill={color} />
      <path d={top} fill={color} />
      <path d={top} fill={WHITE} fillOpacity={0.38} />
      <path d={side} fill={color} />
      <path d={side} fill={NAVY} fillOpacity={0.22} />
      {tape && (
        <>
          <path
            d={`M${cx - t} ${y}l${dx} ${-dy}h${2 * t}l${-dx} ${dy}Z`}
            fill={WHITE}
            fillOpacity={0.55}
          />
          <rect
            x={cx - t}
            y={y}
            width={2 * t}
            height={r1(h * 0.3)}
            fill={WHITE}
            fillOpacity={0.5}
          />
        </>
      )}
      {label && (
        <g>
          <rect
            x={r1(x + w * 0.1)}
            y={r1(y + h * 0.56)}
            width={r1(w * 0.34)}
            height={r1(h * 0.28)}
            rx={2}
            fill={WHITE}
          />
          <rect
            x={r1(x + w * 0.14)}
            y={r1(y + h * 0.62)}
            width={r1(w * 0.2)}
            height={2}
            rx={1}
            fill={NAVY}
            fillOpacity={0.45}
          />
          <rect
            x={r1(x + w * 0.14)}
            y={r1(y + h * 0.72)}
            width={r1(w * 0.14)}
            height={2}
            rx={1}
            fill={RED}
            fillOpacity={0.8}
          />
        </g>
      )}
      <path
        d={`${front}${top}${side}`}
        fill="none"
        stroke={NAVY}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Open cardboard box; children are drawn inside (between the opening and the front face). */
function OpenBox({
  x,
  y,
  w,
  h,
  dx,
  dy,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  children?: ReactNode;
}) {
  const bx = x + dx;
  const by = y - dy;
  const opening = `M${x} ${y}L${bx} ${by}H${bx + w}L${x + w} ${y}Z`;
  const back = `M${bx} ${by}H${bx + w}L${bx + w - 4} ${by - 24}L${bx + 6} ${by - 22}Z`;
  const left = `M${x} ${y}L${bx} ${by}L${bx - 26} ${by - 10}L${x - 28} ${y - 6}Z`;
  const right = `M${x + w} ${y}L${bx + w} ${by}L${bx + w + 24} ${by - 8}L${x + w + 22} ${y - 6}Z`;
  const front = `M${x} ${y}h${w}v${h}h${-w}Z`;
  const side = `M${x + w} ${y}l${dx} ${-dy}v${h}l${-dx} ${dy}Z`;
  const innerShade = `M${x} ${y}L${bx} ${by}V${by + 14}L${x + 6} ${y}Z`;
  return (
    <g>
      <path d={back} fill={AMBER} {...OL} />
      <path d={back} fill={NAVY} fillOpacity={0.12} />
      <path d={opening} fill={MID} />
      <path d={innerShade} fill={NAVY} fillOpacity={0.5} />
      <path
        d={`M${bx} ${by}H${bx + w}V${by + 10}H${bx}Z`}
        fill={NAVY}
        fillOpacity={0.35}
      />
      {children}
      <path d={opening} fill="none" {...OL} />
      <path d={front} fill={AMBER} />
      <path d={side} fill={AMBER} />
      <path d={side} fill={NAVY} fillOpacity={0.22} />
      <path d={`M${x} ${y}h${w}v5h${-w}Z`} fill={NAVY} fillOpacity={0.12} />
      <path d={`${front}${side}`} fill="none" {...OL} />
      <path d={left} fill={AMBER} {...OL} />
      <path d={left} fill={WHITE} fillOpacity={0.3} />
      <path d={right} fill={AMBER} {...OL} />
      <path d={right} fill={NAVY} fillOpacity={0.1} />
    </g>
  );
}

function Phone({
  x,
  y,
  w,
  h,
  screen = WHITE,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  screen?: string;
  children?: ReactNode;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill={NAVY} {...OL} />
      <rect
        x={x + 5}
        y={y + 9}
        width={w - 10}
        height={h - 18}
        rx={7}
        fill={screen}
      />
      {children}
      <rect
        x={x + w / 2 - 9}
        y={y + 3.5}
        width={18}
        height={3}
        rx={1.5}
        fill={MID}
      />
      <rect
        x={x + w / 2 - 12}
        y={y + h - 6}
        width={24}
        height={2.5}
        rx={1.25}
        fill={MID}
      />
    </g>
  );
}

function wave(
  y: number,
  amp: number,
  period: number,
  x0 = -80,
  x1 = 330,
): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += period) {
    d += `q${period / 4} ${-amp} ${period / 2} 0t${period / 2} 0`;
  }
  return `${d}V200H${x0}Z`;
}

function ripple(
  y: number,
  amp: number,
  period: number,
  x0 = -80,
  x1 = 330,
): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += period) {
    d += `q${period / 4} ${-amp} ${period / 2} 0t${period / 2} 0`;
  }
  return d;
}

const FRONDS: [number, number][] = [
  [-34, 12],
  [-30, -6],
  [-12, -17],
  [12, -17],
  [30, -6],
  [34, 12],
  [-4, 20],
];

function Palm({
  x,
  y,
  h,
  lean,
  s = 1,
  leaf = NAVY,
}: {
  x: number;
  y: number;
  h: number;
  lean: number;
  s?: number;
  leaf?: string;
}) {
  const tx = x + lean;
  const ty = y - h;
  const trunk = `M${x - 4 * s} ${y}Q${r1(x + lean * 0.15 - 3 * s)} ${r1(y - h * 0.55)} ${r1(
    tx - 2 * s,
  )} ${ty}L${r1(tx + 2 * s)} ${ty}Q${r1(x + lean * 0.15 + 3 * s)} ${r1(y - h * 0.55)} ${
    x + 4 * s
  } ${y}Z`;
  const leaves = FRONDS.map(([ex0, ey0], i) => {
    const ex = ex0 * s;
    const ey = ey0 * s;
    const len = Math.hypot(ex, ey);
    const nx = -ey / len;
    const ny = ex / len;
    const mx = ex / 2;
    const my = ey / 2 - 9 * s;
    const c1x = r1(tx + mx + nx * 7 * s);
    const c1y = r1(ty + my + ny * 7 * s);
    const c2x = r1(tx + mx - nx * 1.5 * s);
    const c2y = r1(ty + my - ny * 1.5 * s);
    return (
      <path
        key={i}
        d={`M${tx} ${ty}Q${c1x} ${c1y} ${r1(tx + ex)} ${r1(ty + ey)}Q${c2x} ${c2y} ${tx} ${ty}Z`}
        fill={i % 2 === 0 ? leaf : BLUE}
      />
    );
  });
  return (
    <g>
      <path d={trunk} fill={NAVY} />
      <g className="i-fronds" style={{ transformOrigin: `${tx}px ${ty}px` }}>
        {leaves.slice(0, 6)}
        <circle cx={tx - 3 * s} cy={ty + 3 * s} r={2.6 * s} fill={AMBER} />
        <circle cx={tx + 2.5 * s} cy={ty + 4 * s} r={2.6 * s} fill={AMBER} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Illustrations                                                       */
/* ------------------------------------------------------------------ */

function Colis() {
  return (
    <>
      <Blob />
      <Shadow cx={130} cy={154} rx={72} />
      <OpenBox x={70} y={98} w={88} h={54} dx={26} dy={16}>
        <g className="i-items">
          <g transform="rotate(-10 112 80)">
            <rect
              x={100}
              y={56}
              width={24}
              height={44}
              rx={2.5}
              fill={BLUE}
              {...OL2}
            />
            <rect x={119} y={58} width={4} height={40} fill={WHITE} />
            <rect x={100} y={64} width={24} height={4} fill={AMBER} />
            <rect x={105} y={74} width={12} height={2} rx={1} fill={SKY} />
          </g>
          <g>
            <path
              d="M128 70L138 64H152L162 70L168 80L161 84V100H129V84L122 80Z"
              fill={CORAL}
              {...OL2}
            />
            <path
              d="M138 64Q145 72 152 64"
              fill="none"
              {...OL2}
              stroke={WHITE}
            />
            <path d="M129 84L134 78M161 84L156 78" fill="none" {...OL2} />
            <rect
              x={133}
              y={88}
              width={24}
              height={3}
              rx={1.5}
              fill={WHITE}
              fillOpacity={0.5}
            />
          </g>
          <circle cx={150} cy={96} r={6} fill={SKY} {...OL2} />
          <path
            d="M146 93Q150 98 154 93"
            fill="none"
            stroke={WHITE}
            strokeWidth={1.4}
          />
        </g>
      </OpenBox>
      <Spark x={92} y={46} />
      <Spark x={178} y={52} s={0.7} color={CORAL} cls="i-spark i-spark-b" />
      <Spark x={58} y={70} s={0.55} color={SKY} cls="i-spark i-spark-c" />
    </>
  );
}

function Balance() {
  return (
    <>
      <Blob />
      <Shadow cx={120} cy={154} rx={70} />
      <path d="M64 152H176L170 122H70Z" fill={BLUE} {...OL} />
      <path d="M70 122H170L171 128H69Z" fill={NAVY} fillOpacity={0.3} />
      <circle cx={92} cy={138} r={10} fill={WHITE} {...OL2} />
      <path
        d="M86 138A6 6 0 0 1 98 138"
        fill="none"
        stroke={LINE}
        strokeWidth={2}
      />
      <g className="i-needle">
        <circle cx={92} cy={138} r={10} fill="none" />
        <path
          d="M92 138V130"
          stroke={RED}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={92} cy={138} r={2} fill={NAVY} />
      </g>
      <rect x={110} y={130} width={50} height={16} rx={3} fill={NAVY} />
      <g
        className="i-digits"
        fill="none"
        stroke={SKY}
        strokeWidth={1.6}
        strokeLinejoin="round"
      >
        <path d="M116 134h6v8h-6zM116 138h6" />
        <path d="M127 134h6v8h-6z" />
        <circle cx={137} cy={142} r={0.8} fill={SKY} stroke="none" />
        <path d="M140 134h6v4h-6v4h6" />
      </g>
      <rect x={150} y={135} width={5} height={6} rx={1} fill={CORAL} />
      <rect x={56} y={112} width={128} height={10} rx={4} fill={NAVY} {...OL} />
      <rect
        x={62}
        y={114}
        width={60}
        height={2}
        rx={1}
        fill={WHITE}
        fillOpacity={0.25}
      />
      <g className="i-parcel">
        <Box x={88} y={84} w={56} h={28} dx={16} dy={10} />
      </g>
      <Spark x={60} y={64} s={0.8} />
      <Spark x={184} y={70} s={0.6} color={SKY} cls="i-spark i-spark-b" />
    </>
  );
}

function Metre() {
  const ticks = [];
  for (let i = 0; i < 13; i++) {
    const x = 64 + i * 8;
    ticks.push(
      <path
        key={i}
        d={`M${x} 147V${i % 2 === 0 ? 152 : 150}`}
        stroke={NAVY}
        strokeWidth={1.4}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <>
      <Blob />
      <Shadow cx={120} cy={157} rx={78} />
      <Box x={62} y={90} w={94} h={56} dx={26} dy={16} label={false} />
      <g className="i-dim i-dim-w">
        <path
          d="M88 66V58M182 66V58"
          stroke={SKY}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path
          d="M92 62H178"
          stroke={CORAL}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path
          d="M95 58L89 62L95 66M175 58L181 62L175 66"
          fill="none"
          {...OL2}
          stroke={CORAL}
        />
      </g>
      <g className="i-dim i-dim-h">
        <path
          d="M190 74H198M190 130H198"
          stroke={SKY}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path
          d="M201 78V126"
          stroke={CORAL}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path
          d="M197 81L201 75L205 81M197 123L201 129L205 123"
          fill="none"
          {...OL2}
          stroke={CORAL}
        />
      </g>
      <g className="i-tape">
        <rect
          x={56}
          y={145}
          width={112}
          height={9}
          rx={1.5}
          fill={AMBER}
          {...OL2}
        />
        {ticks}
        <rect x={166} y={142} width={5} height={14} rx={1.5} fill={NAVY} />
      </g>
      <rect x={22} y={124} width={36} height={32} rx={11} fill={RED} {...OL} />
      <path
        d="M26 132Q40 126 54 132"
        fill="none"
        stroke={WHITE}
        strokeOpacity={0.35}
        strokeWidth={2}
      />
      <circle cx={40} cy={140} r={8} fill={WHITE} {...OL2} />
      <circle cx={40} cy={140} r={2.5} fill={NAVY} />
      <rect x={52} y={146} width={8} height={7} rx={2} fill={NAVY} />
    </>
  );
}

function Plane() {
  return (
    <g>
      <path d="M-4 -4L-16 -20H-9L8 -4Z" fill={SKY} {...OL2} />
      <path d="M-40 -5L-55 -32H-44L-24 -6Z" fill={BLUE} {...OL2} />
      <path
        d="M-54 -2C-56 -8 -50 -9 -44 -9L32 -9C46 -9 60 -2 60 4C60 10 50 12 36 12L-38 12C-46 12 -52 6 -54 -2Z"
        fill={WHITE}
        {...OL}
      />
      <path d="M-50 4H52" stroke={RED} strokeWidth={3} strokeLinecap="round" />
      <path d="M-46 3L-62 9L-57 12L-40 9Z" fill={BLUE} {...OL2} />
      <path d="M44 -6C50 -5 55 -1 57 2H45Z" fill={SKY} {...OL2} />
      {[-30, -20, -10, 0, 10, 20, 30].map((wx) => (
        <circle key={wx} cx={wx} cy={-2} r={2} fill={SKY} />
      ))}
      <path d="M-4 5L-24 30H-14L14 6Z" fill={MID} {...OL2} />
      <rect x={-14} y={13} width={18} height={8} rx={4} fill={NAVY} />
      <rect
        x={-18}
        y={-9}
        width={30}
        height={6}
        rx={1}
        fill={NAVY}
        fillOpacity={0.07}
      />
    </g>
  );
}

function Avion() {
  return (
    <>
      <BlobClip id="ill-avion-clip">
        <circle cx={176} cy={46} r={15} fill={AMBER} fillOpacity={0.9} />
        <Cloud x={40} y={60} s={0.75} />
        <Cloud x={150} y={36} s={0.55} cls="i-cloud i-cloud-b" />
        <Cloud x={176} y={116} s={0.65} cls="i-cloud i-cloud-c" />
        <path d="M0 150H240V200H0Z" fill={LINE} />
        <path d="M30 172L210 172L170 140L70 140Z" fill={MID} />
        <path
          d="M120 142V170"
          stroke={WHITE}
          strokeWidth={2.5}
          strokeDasharray="6 6"
        />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle cx={76 - i * 12} cy={143 + i * 8} r={1.8} fill={AMBER} />
            <circle cx={164 + i * 12} cy={143 + i * 8} r={1.8} fill={AMBER} />
          </g>
        ))}
        <path
          className="i-trail"
          d="M44 134Q74 126 96 106"
          fill="none"
          stroke={SKY}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="2 7"
        />
        <g transform="translate(130 82) rotate(-14)">
          <g className="i-plane">
            <Plane />
          </g>
        </g>
      </BlobClip>
    </>
  );
}

function Navire() {
  const rows = [
    [RED, BLUE, AMBER, SKY, CORAL],
    [BLUE, CORAL, MID, RED, AMBER],
  ];
  return (
    <>
      <BlobClip id="ill-navire-clip">
        <Cloud x={160} y={44} s={0.6} />
        <Cloud x={46} y={54} s={0.45} cls="i-cloud i-cloud-b" />
        <path
          d="M118 40l4 3 4-3M132 48l3 2.5 3-2.5"
          fill="none"
          stroke={NAVY}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g className="i-wave i-wave-back">
          <path d={wave(134, 4, 40)} fill={SKY} />
        </g>
        <g className="i-ship">
          {rows.map((row, ri) =>
            row.map((c, ci) => (
              <g key={`${ri}-${ci}`}>
                <rect
                  x={78 + ci * 22}
                  y={98 - ri * 18}
                  width={22}
                  height={18}
                  fill={c}
                  {...OL2}
                />
                <path
                  d={`M${84 + ci * 22} ${101 - ri * 18}v12M${89 + ci * 22} ${101 - ri * 18}v12M${
                    94 + ci * 22
                  } ${101 - ri * 18}v12`}
                  stroke={NAVY}
                  strokeOpacity={0.25}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              </g>
            )),
          )}
          <rect x={52} y={60} width={10} height={14} fill={RED} {...OL2} />
          <rect x={52} y={60} width={10} height={4} fill={NAVY} />
          <rect
            x={44}
            y={72}
            width={28}
            height={44}
            rx={2}
            fill={WHITE}
            {...OL}
          />
          <rect x={48} y={78} width={20} height={6} rx={1.5} fill={SKY} />
          <rect x={48} y={90} width={20} height={4} rx={1} fill={LINE} />
          <path
            d="M202 116V96M196 100H208"
            stroke={NAVY}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path d="M32 116H212L196 144H50Z" fill={NAVY} {...OL} />
          <path d="M40 130H204L196 144H50Z" fill={RED} />
          <path
            d="M37 124H207"
            stroke={WHITE}
            strokeWidth={2}
            strokeOpacity={0.5}
          />
          <circle cx={190} cy={122} r={2} fill={WHITE} fillOpacity={0.6} />
        </g>
        <g className="i-wave i-wave-front">
          <path d={wave(141, 5, 48)} fill={BLUE} />
          <path
            d={ripple(152, 2.5, 48)}
            fill="none"
            stroke={SKY}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
        </g>
      </BlobClip>
    </>
  );
}

function Conteneur() {
  let zig = "M44 38";
  for (let y = 38; y < 148; y += 12) zig += `L56 ${y + 6}L44 ${y + 12}`;
  let jz = "M30 34";
  for (let x = 30; x < 206; x += 12) jz += `L${x + 6} 26L${x + 12} 34`;
  return (
    <>
      <Blob />
      <path
        d="M24 150H216"
        stroke={LINE}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Shadow cx={150} cy={150} rx={62} ry={4} />
      <path d="M50 26L50 8L56 26" fill={AMBER} {...OL2} />
      <path
        d="M50 8L28 26M50 8L170 26"
        stroke={NAVY}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <rect x={44} y={34} width={12} height={116} fill={AMBER} {...OL2} />
      <path
        d={zig}
        fill="none"
        stroke={NAVY}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <rect x={30} y={26} width={180} height={8} fill={AMBER} {...OL2} />
      <path
        d={jz}
        fill="none"
        stroke={NAVY}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <rect x={22} y={34} width={20} height={13} rx={2} fill={NAVY} />
      <rect x={56} y={34} width={15} height={13} rx={2} fill={BLUE} {...OL2} />
      <rect x={60} y={37} width={8} height={5} rx={1} fill={SKY} />
      <rect
        className="i-cable"
        x={137}
        y={40}
        width={2}
        height={50}
        fill={NAVY}
      />
      <rect x={129} y={33} width={18} height={7} rx={2} fill={NAVY} />
      <g className="i-load">
        <path
          d="M138 90V94M138 94L110 100M138 94L166 100"
          stroke={NAVY}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <circle cx={138} cy={92} r={3} fill={NAVY} />
        <rect
          x={106}
          y={98}
          width={64}
          height={26}
          rx={1.5}
          fill={RED}
          {...OL}
        />
        <rect
          x={106}
          y={98}
          width={64}
          height={4}
          fill={NAVY}
          fillOpacity={0.2}
        />
        {[114, 122, 130, 138, 146, 154, 162].map((x) => (
          <path
            key={x}
            d={`M${x} 104V119`}
            stroke={NAVY}
            strokeOpacity={0.28}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ))}
      </g>
      <rect x={96} y={124} width={86} height={8} rx={1.5} fill={NAVY} />
      <path d="M182 134V106H198L210 120V134Z" fill={BLUE} {...OL} />
      <path d="M186 110H196L204 120H186Z" fill={SKY} />
      <rect x={176} y={130} width={36} height={6} rx={2} fill={NAVY} />
      {[112, 134, 196].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={140} r={8} fill={NAVY} />
          <circle cx={cx} cy={140} r={3} fill={MIST} />
        </g>
      ))}
      <rect x={206} y={124} width={5} height={3} rx={1} fill={AMBER} />
    </>
  );
}

function Agence() {
  return (
    <>
      <Blob />
      <Shadow cx={128} cy={155} rx={88} />
      <path
        d="M140 14V30"
        stroke={NAVY}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        className="i-glow"
        d="M128 40L110 92H170L152 40Z"
        fill={AMBER}
        fillOpacity={0.16}
      />
      <path d="M128 40Q128 28 140 28Q152 28 152 40Z" fill={AMBER} {...OL2} />
      <rect x={30} y={66} width={62} height={4} rx={1.5} fill={NAVY} />
      <rect x={30} y={102} width={62} height={4} rx={1.5} fill={NAVY} />
      <Box x={34} y={52} w={22} h={14} dx={6} dy={4} sw={2} label={false} />
      <Box
        x={62}
        y={54}
        w={18}
        h={12}
        dx={6}
        dy={4}
        sw={2}
        label={false}
        tape={false}
      />
      <Box x={36} y={84} w={26} h={18} dx={6} dy={4} sw={2} label={false} />
      <Box
        x={66}
        y={88}
        w={16}
        h={14}
        dx={6}
        dy={4}
        sw={2}
        label={false}
        tape={false}
      />
      <g className="i-agent">
        <rect x={135} y={72} width={10} height={10} fill={SKIN_B} />
        <circle cx={140} cy={64} r={12} fill={SKIN_B} />
        <path
          d="M128 62C128 52 134 48 141 48C149 48 153 54 152 61C146 58 136 58 128 62Z"
          fill={NAVY}
        />
        <path
          d="M116 114C116 92 124 80 140 80C156 80 164 92 164 114Z"
          fill={BLUE}
          {...OL}
        />
        <path d="M133 80L140 90L147 80" fill={WHITE} {...OL2} />
        <rect x={148} y={94} width={8} height={5} rx={1} fill={RED} />
      </g>
      <rect x={98} y={106} width={126} height={8} rx={3} fill={NAVY} {...OL2} />
      <rect x={102} y={114} width={118} height={38} fill={BLUE} {...OL} />
      <rect x={102} y={124} width={118} height={6} fill={RED} />
      <rect
        x={110}
        y={136}
        width={30}
        height={3}
        rx={1.5}
        fill={WHITE}
        fillOpacity={0.3}
      />
      <path d="M118 104V96" stroke={NAVY} strokeWidth={2.5} />
      <rect
        x={106}
        y={82}
        width={26}
        height={16}
        rx={2.5}
        fill={NAVY}
        {...OL2}
      />
      <rect x={110} y={86} width={12} height={2} rx={1} fill={SKY} />
      <rect
        x={110}
        y={91}
        width={18}
        height={2}
        rx={1}
        fill={SKY}
        fillOpacity={0.6}
      />
      <g className="i-parcel">
        <Box x={174} y={88} w={28} h={18} dx={8} dy={5} sw={2} label={false} />
      </g>
    </>
  );
}

function Hand({ skin, sleeve }: { skin: string; sleeve: string }) {
  return (
    <g>
      <path d="M58 118L82 140L22 200L-2 178Z" fill={sleeve} {...OL} />
      <path d="M58 118L66 126L6 186L-2 178Z" fill={WHITE} fillOpacity={0.15} />
      <path d="M54 122L62 114L86 136L78 144Z" fill={WHITE} {...OL2} />
      <path
        d="M64 116C70 108 82 108 98 114L108 120C112 126 106 132 98 130L84 138C76 140 70 134 64 126Z"
        fill={skin}
        {...OL2}
      />
      <path
        d="M86 114C88 104 94 98 100 100C103 104 100 112 96 118Z"
        fill={skin}
        {...OL2}
      />
    </g>
  );
}

function Remise() {
  return (
    <>
      <Blob />
      <g className="i-parcel">
        <Box x={94} y={84} w={54} h={38} dx={14} dy={9} />
      </g>
      <Hand skin={SKIN_A} sleeve={BLUE} />
      <g transform="translate(250 0) scale(-1 1)">
        <Hand skin={SKIN_B} sleeve={CORAL} />
      </g>
      <g transform="translate(30 30) rotate(-8)">
        <g className="i-card">
          <rect
            x={0}
            y={0}
            width={60}
            height={40}
            rx={5}
            fill={WHITE}
            {...OL2}
          />
          <path d="M5 0H55A5 5 0 0 1 60 5V9H0V5A5 5 0 0 1 5 0Z" fill={RED} />
          <rect x={6} y={14} width={16} height={20} rx={3} fill={SKY} />
          <circle cx={14} cy={21} r={4} fill={MID} />
          <path d="M8 34C8 28 11 26 14 26C17 26 20 28 20 34Z" fill={MID} />
          <rect x={27} y={16} width={26} height={3} rx={1.5} fill={LINE} />
          <rect x={27} y={23} width={18} height={3} rx={1.5} fill={LINE} />
          <rect x={27} y={30} width={22} height={3} rx={1.5} fill={LINE} />
          <path
            d="M5 0H55A5 5 0 0 1 60 5V35A5 5 0 0 1 55 40H5A5 5 0 0 1 0 35V5A5 5 0 0 1 5 0Z"
            fill="none"
            {...OL2}
          />
        </g>
      </g>
      <Spark x={196} y={40} s={0.9} />
      <Spark x={176} y={62} s={0.5} color={SKY} cls="i-spark i-spark-b" />
    </>
  );
}

function Douane() {
  return (
    <>
      <Blob />
      <Shadow cx={118} cy={160} rx={66} />
      <g transform="translate(36 112) rotate(-12)">
        <rect x={0} y={0} width={36} height={46} rx={4} fill={NAVY} {...OL2} />
        <circle
          cx={18}
          cy={18}
          r={7}
          fill="none"
          stroke={AMBER}
          strokeWidth={2}
        />
        <path d="M14 18H22M18 14V22" stroke={AMBER} strokeWidth={1.5} />
        <rect
          x={9}
          y={32}
          width={18}
          height={2.5}
          rx={1.2}
          fill={AMBER}
          fillOpacity={0.8}
        />
      </g>
      <g transform="rotate(7 120 100)">
        <rect
          x={74}
          y={38}
          width={90}
          height={112}
          rx={6}
          fill={LINE}
          {...OL2}
        />
      </g>
      <rect x={66} y={44} width={92} height={114} rx={6} fill={WHITE} {...OL} />
      <rect x={76} y={54} width={34} height={6} rx={2} fill={NAVY} />
      <rect x={136} y={52} width={14} height={14} rx={2} fill={SKY} />
      {[70, 78, 86].map((y, i) => (
        <rect
          key={y}
          x={76}
          y={y}
          width={i === 2 ? 44 : 64}
          height={3}
          rx={1.5}
          fill={LINE}
        />
      ))}
      <rect
        x={76}
        y={96}
        width={40}
        height={36}
        rx={2}
        fill="none"
        stroke={LINE}
        strokeWidth={2}
      />
      <path
        d="M76 108H116M76 120H116M96 96V132"
        stroke={LINE}
        strokeWidth={2}
      />
      <path
        d="M78 146C82 138 86 150 90 142C93 137 96 148 102 142"
        fill="none"
        stroke={NAVY}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <g transform="rotate(-14 134 124)">
        <g className="i-imprint">
          <circle
            cx={134}
            cy={124}
            r={17}
            fill={RED}
            fillOpacity={0.06}
            stroke={RED}
            strokeWidth={3}
          />
          <circle
            cx={134}
            cy={124}
            r={11.5}
            fill="none"
            stroke={RED}
            strokeWidth={1.4}
          />
          <path
            d="M127 124L132 129L141 119"
            fill="none"
            stroke={RED}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>
      <g className="i-stamp">
        <rect x={115} y={98} width={38} height={8} rx={2} fill={RED} {...OL2} />
        <rect
          x={119}
          y={86}
          width={30}
          height={12}
          rx={3}
          fill={BLUE}
          {...OL2}
        />
        <rect x={130} y={68} width={8} height={18} fill={NAVY} />
        <ellipse cx={134} cy={63} rx={13} ry={9} fill={NAVY} {...OL2} />
        <ellipse
          cx={130}
          cy={60}
          rx={4}
          ry={2}
          fill={WHITE}
          fillOpacity={0.3}
        />
      </g>
    </>
  );
}

function Suivi() {
  return (
    <>
      <Blob />
      <Shadow cx={120} cy={164} rx={46} ry={4} />
      <defs>
        <clipPath id="ill-suivi-screen">
          <rect x={87} y={25} width={66} height={130} rx={7} />
        </clipPath>
      </defs>
      <Phone x={82} y={16} w={76} h={148} screen={MIST}>
        <g clipPath="url(#ill-suivi-screen)">
          <path
            d="M80 88C104 96 120 74 160 84"
            fill="none"
            stroke={SKY}
            strokeWidth={9}
          />
          <path
            d="M100 20V170M80 116H160M134 20V170M80 60H160M80 140L160 128"
            fill="none"
            stroke={WHITE}
            strokeWidth={6}
          />
          <rect x={106} y={30} width={22} height={24} rx={3} fill={LINE} />
          <rect x={140} y={96} width={18} height={14} rx={3} fill={LINE} />
          <rect x={106} y={122} width={22} height={12} rx={3} fill={LINE} />
          <circle cx={146} cy={44} r={7} fill={SKY} fillOpacity={0.6} />
          <polyline
            points="100,142 100,116 134,100 134,72 114,60"
            fill="none"
            stroke={BLUE}
            strokeOpacity={0.18}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            className="i-route"
            points="100,142 100,116 134,100 134,72 114,60"
            fill="none"
            stroke={RED}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 5"
          />
          <circle
            cx={100}
            cy={142}
            r={5}
            fill={BLUE}
            stroke={WHITE}
            strokeWidth={2}
          />
          <circle
            cx={114}
            cy={60}
            r={4}
            fill={NAVY}
            stroke={WHITE}
            strokeWidth={2}
          />
        </g>
      </Phone>
      <g className="i-pin" transform="translate(114 60)">
        <path
          d="M0 0C-4 -6 -10 -11 -10 -18A10 10 0 1 1 10 -18C10 -11 4 -6 0 0Z"
          fill={RED}
          {...OL2}
        />
        <circle cx={0} cy={-18} r={4} fill={WHITE} />
      </g>
      <g className="i-chip">
        <rect
          x={22}
          y={96}
          width={56}
          height={30}
          rx={9}
          fill={WHITE}
          {...OL2}
        />
        <rect x={29} y={103} width={16} height={16} rx={3} fill={AMBER} />
        <path d="M37 103V109" stroke={WHITE} strokeWidth={2.5} />
        <rect
          x={50}
          y={105}
          width={20}
          height={3}
          rx={1.5}
          fill={NAVY}
          fillOpacity={0.5}
        />
        <rect x={50} y={112} width={13} height={3} rx={1.5} fill={LINE} />
      </g>
      <g className="i-chip i-chip-b">
        <rect
          x={164}
          y={46}
          width={54}
          height={26}
          rx={9}
          fill={WHITE}
          {...OL2}
        />
        <rect x={172} y={54} width={38} height={4} rx={2} fill={LINE} />
        <rect x={172} y={54} width={24} height={4} rx={2} fill={BLUE} />
        <rect
          x={172}
          y={62}
          width={16}
          height={3}
          rx={1.5}
          fill={NAVY}
          fillOpacity={0.4}
        />
      </g>
    </>
  );
}

function Message() {
  return (
    <>
      <Blob />
      <Shadow cx={120} cy={164} rx={46} ry={4} />
      <Phone x={82} y={16} w={76} h={148} screen={MIST}>
        <rect x={87} y={25} width={66} height={18} rx={7} fill={BLUE} />
        <rect x={87} y={36} width={66} height={7} fill={BLUE} />
        <circle cx={97} cy={34} r={5} fill={SKY} />
        <rect x={106} y={30} width={26} height={3} rx={1.5} fill={WHITE} />
        <rect
          x={106}
          y={36}
          width={16}
          height={2.5}
          rx={1.25}
          fill={WHITE}
          fillOpacity={0.5}
        />
        <g className="i-b i-b1">
          <rect
            x={92}
            y={50}
            width={42}
            height={17}
            rx={7}
            fill={WHITE}
            stroke={LINE}
            strokeWidth={1.5}
          />
          <rect
            x={98}
            y={55}
            width={28}
            height={2.5}
            rx={1.25}
            fill={NAVY}
            fillOpacity={0.4}
          />
          <rect
            x={98}
            y={60}
            width={18}
            height={2.5}
            rx={1.25}
            fill={NAVY}
            fillOpacity={0.25}
          />
        </g>
        <g className="i-b i-b2">
          <rect x={104} y={72} width={44} height={19} rx={7} fill={CHAT} />
          <rect x={110} y={77} width={30} height={2.5} rx={1.25} fill={WHITE} />
          <rect
            x={110}
            y={83}
            width={20}
            height={2.5}
            rx={1.25}
            fill={WHITE}
            fillOpacity={0.7}
          />
          <path
            d="M136 85l2 2 3-3M139 85l2 2 3-3"
            fill="none"
            stroke={WHITE}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </g>
        <g className="i-b i-b3">
          <rect
            x={92}
            y={96}
            width={36}
            height={22}
            rx={7}
            fill={WHITE}
            stroke={LINE}
            strokeWidth={1.5}
          />
          <rect x={97} y={100} width={14} height={13} rx={2} fill={AMBER} />
          <path d="M104 100V105" stroke={WHITE} strokeWidth={2} />
          <rect
            x={114}
            y={103}
            width={10}
            height={2.5}
            rx={1.25}
            fill={NAVY}
            fillOpacity={0.35}
          />
          <rect
            x={114}
            y={108}
            width={7}
            height={2.5}
            rx={1.25}
            fill={NAVY}
            fillOpacity={0.2}
          />
        </g>
        <g className="i-b i-b4">
          <rect
            x={112}
            y={123}
            width={36}
            height={15}
            rx={7}
            fill={CHAT_LIGHT}
            stroke={CHAT}
            strokeWidth={1.5}
          />
          <rect
            x={118}
            y={129}
            width={22}
            height={2.5}
            rx={1.25}
            fill={NAVY}
            fillOpacity={0.4}
          />
        </g>
        <rect
          x={92}
          y={142}
          width={26}
          height={9}
          rx={4.5}
          fill={WHITE}
          stroke={LINE}
          strokeWidth={1.5}
        />
        <circle className="i-dot" cx={99} cy={146.5} r={1.6} fill={MID} />
        <circle
          className="i-dot i-dot-2"
          cx={105}
          cy={146.5}
          r={1.6}
          fill={MID}
        />
        <circle
          className="i-dot i-dot-3"
          cx={111}
          cy={146.5}
          r={1.6}
          fill={MID}
        />
      </Phone>
      <g className="i-float">
        <path
          d="M30 48H70A10 10 0 0 1 80 58V68A10 10 0 0 1 70 78H44L34 86V78H30A10 10 0 0 1 20 68V58A10 10 0 0 1 30 48Z"
          fill={CHAT}
          {...OL2}
        />
        <circle cx={38} cy={63} r={3} fill={WHITE} />
        <circle cx={50} cy={63} r={3} fill={WHITE} />
        <circle cx={62} cy={63} r={3} fill={WHITE} />
      </g>
      <g className="i-float i-float-b">
        <circle cx={168} cy={30} r={11} fill={CORAL} {...OL2} />
        <circle cx={168} cy={30} r={3.5} fill={WHITE} />
      </g>
      <g className="i-float i-float-c">
        <path
          d="M172 98H204A8 8 0 0 1 212 106V114A8 8 0 0 1 204 122H184L176 128V122H172A8 8 0 0 1 164 114V106A8 8 0 0 1 172 98Z"
          fill={CHAT_LIGHT}
          stroke={CHAT}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <rect
          x={172}
          y={106}
          width={30}
          height={3}
          rx={1.5}
          fill={NAVY}
          fillOpacity={0.35}
        />
        <rect
          x={172}
          y={112}
          width={18}
          height={3}
          rx={1.5}
          fill={NAVY}
          fillOpacity={0.2}
        />
      </g>
    </>
  );
}

function Coin({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <path d={`M${cx - 14} ${cy}v6a14 5 0 0 0 28 0v-6Z`} fill={AMBER} />
      <path
        d={`M${cx - 14} ${cy}v6a14 5 0 0 0 28 0v-6Z`}
        fill={NAVY}
        fillOpacity={0.22}
      />
      <path d={`M${cx - 14} ${cy}v6a14 5 0 0 0 28 0v-6`} fill="none" {...OL2} />
      <ellipse cx={cx} cy={cy} rx={14} ry={5} fill={AMBER} {...OL2} />
      <ellipse
        cx={cx}
        cy={cy}
        rx={7}
        ry={2.2}
        fill="none"
        stroke={NAVY}
        strokeOpacity={0.35}
        strokeWidth={1.4}
      />
    </g>
  );
}

function Paiement() {
  return (
    <>
      <Blob />
      <Shadow cx={132} cy={160} rx={74} />
      <g transform="rotate(-8 98 96)">
        <Phone x={62} y={24} w={70} h={136}>
          <rect x={67} y={33} width={60} height={34} rx={6} fill={MIST} />
          <circle cx={97} cy={50} r={11} fill={BLUE} />
          <path
            d="M91 50L95 54L103 46"
            fill="none"
            stroke={WHITE}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x={78} y={76} width={38} height={6} rx={3} fill={NAVY} />
          <rect x={84} y={87} width={26} height={3} rx={1.5} fill={LINE} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle
                cx={78}
                cy={102 + i * 12}
                r={3.5}
                fill={i === 0 ? AMBER : SKY}
              />
              <rect
                x={86}
                y={100.5 + i * 12}
                width={30}
                height={3}
                rx={1.5}
                fill={LINE}
              />
            </g>
          ))}
          <rect x={72} y={136} width={50} height={11} rx={5.5} fill={RED} />
          <path
            d="M93 141.5H101M98 138.5L101 141.5L98 144.5"
            fill="none"
            stroke={WHITE}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Phone>
      </g>
      <g transform="rotate(-6 168 96)">
        <g className="i-card">
          <rect
            x={126}
            y={70}
            width={84}
            height={54}
            rx={8}
            fill={BLUE}
            {...OL}
          />
          <path
            d="M126 108Q168 90 210 100V116A8 8 0 0 1 202 124H134A8 8 0 0 1 126 116Z"
            fill={MID}
          />
          <rect x={136} y={82} width={15} height={12} rx={2.5} fill={AMBER} />
          <path
            d="M136 88H151M143.5 82V94"
            stroke={NAVY}
            strokeOpacity={0.3}
            strokeWidth={1.2}
          />
          <path
            d="M190 80a6 6 0 0 1 0 10M195 77a10 10 0 0 1 0 16"
            fill="none"
            stroke={WHITE}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={136 + i * 16}
              y={102}
              width={12}
              height={3}
              rx={1.5}
              fill={WHITE}
              fillOpacity={0.75}
            />
          ))}
          <rect
            x={136}
            y={111}
            width={22}
            height={3}
            rx={1.5}
            fill={WHITE}
            fillOpacity={0.4}
          />
          <rect
            x={126}
            y={70}
            width={84}
            height={54}
            rx={8}
            fill="none"
            {...OL}
          />
        </g>
      </g>
      <Coin cx={190} cy={148} />
      <Coin cx={190} cy={140} />
      <Coin cx={190} cy={132} />
      <g className="i-coin">
        <Coin cx={190} cy={124} />
      </g>
      <Spark x={44} y={50} s={0.8} />
      <Spark x={218} y={64} s={0.55} color={CORAL} cls="i-spark i-spark-b" />
    </>
  );
}

function Vide() {
  return (
    <>
      <Blob />
      <Shadow cx={114} cy={154} rx={66} />
      <OpenBox x={60} y={98} w={82} h={54} dx={24} dy={15}>
        <path
          d="M66 98L84 86"
          stroke={WHITE}
          strokeOpacity={0.1}
          strokeWidth={6}
        />
      </OpenBox>
      <g className="i-dust">
        <circle cx={100} cy={52} r={3} fill={SKY} />
        <circle cx={116} cy={44} r={2} fill={SKY} />
        <circle cx={132} cy={54} r={2.5} fill={LINE} />
      </g>
      <g className="i-dust i-dust-b">
        <circle cx={94} cy={42} r={2} fill={SKY} />
        <circle cx={124} cy={36} r={3} fill={LINE} />
        <circle cx={140} cy={44} r={1.8} fill={SKY} />
      </g>
      <g transform="translate(190 106)">
        <g className="i-loupe">
          <path
            d="M12 12L28 28"
            stroke={NAVY}
            strokeWidth={8}
            strokeLinecap="round"
          />
          <path
            d="M18 18L28 28"
            stroke={BLUE}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle
            cx={0}
            cy={0}
            r={17}
            fill={WHITE}
            fillOpacity={0.7}
            stroke={NAVY}
            strokeWidth={4.5}
          />
          <path
            d="M-9 -4A10 10 0 0 1 -3 -10"
            fill="none"
            stroke={SKY}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      </g>
      <Spark x={50} y={60} s={0.6} color={SKY} />
      <Spark x={186} y={56} s={0.6} color={SKY} cls="i-spark i-spark-b" />
    </>
  );
}

const CONFETTI: {
  x: number;
  y: number;
  c: string;
  k: "r" | "c" | "t";
  a: number;
}[] = [
  { x: 52, y: 40, c: RED, k: "r", a: 20 },
  { x: 70, y: 24, c: SKY, k: "c", a: 0 },
  { x: 92, y: 46, c: AMBER, k: "t", a: 10 },
  { x: 112, y: 22, c: CORAL, k: "r", a: -30 },
  { x: 132, y: 38, c: BLUE, k: "c", a: 0 },
  { x: 204, y: 30, c: AMBER, k: "r", a: 40 },
  { x: 214, y: 70, c: RED, k: "c", a: 0 },
  { x: 40, y: 80, c: AMBER, k: "c", a: 0 },
  { x: 196, y: 104, c: SKY, k: "t", a: -20 },
  { x: 150, y: 18, c: RED, k: "t", a: 30 },
];

function Succes() {
  return (
    <>
      <Blob />
      <Shadow cx={114} cy={152} rx={66} />
      {CONFETTI.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a})`}>
          <g className={`i-cf i-cf-${i % 5}`}>
            {p.k === "r" && (
              <rect x={-2.5} y={-5} width={5} height={10} rx={1.2} fill={p.c} />
            )}
            {p.k === "c" && <circle r={3.2} fill={p.c} />}
            {p.k === "t" && <path d="M0 -5L5 4H-5Z" fill={p.c} />}
          </g>
        </g>
      ))}
      <Box x={66} y={88} w={82} h={58} dx={22} dy={14} />
      <g className="i-badge">
        <circle cx={168} cy={66} r={26} fill={AMBER} fillOpacity={0.35} />
        <circle cx={168} cy={66} r={21} fill={BLUE} {...OL} />
        <path
          d="M158 66L165 73L179 59"
          fill="none"
          stroke={WHITE}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </>
  );
}

function Paris() {
  const left = [
    { x: 4, w: 30, h: 52, c: SKY },
    { x: 34, w: 30, h: 64, c: LINE },
    { x: 64, w: 26, h: 46, c: SKY },
  ];
  const right = [
    { x: 150, w: 28, h: 56, c: LINE },
    { x: 178, w: 32, h: 68, c: SKY },
    { x: 210, w: 30, h: 50, c: LINE },
  ];
  const base = 146;
  const building = (b: { x: number; w: number; h: number; c: string }) => {
    const top = base - b.h;
    const wins = [];
    for (let row = 0; row < Math.floor((b.h - 18) / 12); row++) {
      for (let col = 0; col < Math.floor((b.w - 6) / 8); col++) {
        wins.push(
          <rect
            key={`${row}-${col}`}
            x={b.x + 5 + col * 8}
            y={top + 14 + row * 12}
            width={4}
            height={6}
            rx={1}
            fill={MID}
            fillOpacity={0.45}
          />,
        );
      }
    }
    return (
      <g key={b.x}>
        <path
          d={`M${b.x} ${top}L${b.x + 4} ${top - 8}H${b.x + b.w - 4}L${b.x + b.w} ${top}Z`}
          fill={MID}
        />
        <rect x={b.x + b.w - 10} y={top - 13} width={4} height={6} fill={MID} />
        <rect x={b.x} y={top} width={b.w} height={b.h} fill={b.c} />
        <rect
          x={b.x}
          y={top}
          width={b.w}
          height={2}
          fill={WHITE}
          fillOpacity={0.6}
        />
        {wins}
      </g>
    );
  };
  return (
    <SceneClip id="ill-paris-clip">
      <circle cx={180} cy={44} r={16} fill={AMBER} />
      <Cloud x={30} y={46} s={0.6} />
      <Cloud x={186} y={64} s={0.5} cls="i-cloud i-cloud-b" />
      {left.map(building)}
      {right.map(building)}
      <g fill={NAVY}>
        <path
          d="M120 12V24"
          stroke={NAVY}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path d="M116.5 24H123.5L128 64H112Z" />
        <rect x={107} y={63} width={26} height={5} rx={1} />
        <path d="M110 68H130L139 102H101Z" />
        <rect x={95} y={101} width={50} height={6} rx={1.5} />
        <path d="M98 107H142L160 146H143C139 130 129 122 120 122C111 122 101 130 97 146H80Z" />
      </g>
      <path
        d="M113 72L127 98M127 72L113 98M118 30L122 60M122 30L118 60"
        stroke={WHITE}
        strokeOpacity={0.22}
        strokeWidth={1.2}
      />
      <rect x={0} y={146} width={240} height={5} fill={MID} />
      <circle cx={70} cy={142} r={7} fill={NAVY} />
      <circle cx={82} cy={140} r={8} fill={MID} />
      <circle cx={162} cy={141} r={7} fill={MID} />
      <circle cx={174} cy={142} r={6} fill={NAVY} />
      <rect x={0} y={151} width={240} height={30} fill={BLUE} />
      <g className="i-ripple">
        <path
          d={ripple(160, 1.6, 24)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.6}
          strokeOpacity={0.6}
        />
        <path
          d={ripple(168, 1.6, 30, -90)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.4}
          strokeOpacity={0.4}
        />
      </g>
      <g className="i-boat">
        <path d="M150 158H186L182 164H154Z" fill={WHITE} />
        <rect x={156} y={153} width={24} height={5} rx={2} fill={SKY} />
        <path
          d="M159 155.5H177"
          stroke={MID}
          strokeWidth={1.6}
          strokeDasharray="2 2"
        />
      </g>
    </SceneClip>
  );
}

function Brazzaville() {
  const blds = [
    { x: 132, w: 16, h: 30, c: SKY },
    { x: 148, w: 18, h: 44, c: LINE },
    { x: 186, w: 22, h: 54, c: SKY },
    { x: 208, w: 16, h: 34, c: LINE },
  ];
  const base = 116;
  return (
    <SceneClip id="ill-brazzaville-clip">
      <circle cx={70} cy={70} r={20} fill={AMBER} />
      <circle cx={70} cy={70} r={28} fill={AMBER} fillOpacity={0.18} />
      {blds.map((b) => (
        <g key={b.x}>
          <rect x={b.x} y={base - b.h} width={b.w} height={b.h} fill={b.c} />
          {Array.from({ length: Math.floor((b.h - 6) / 8) }, (_, r) => (
            <rect
              key={r}
              x={b.x + 3}
              y={base - b.h + 5 + r * 8}
              width={b.w - 6}
              height={2.5}
              rx={1}
              fill={MID}
              fillOpacity={0.35}
            />
          ))}
        </g>
      ))}
      <path d="M166 116V40L176 32L186 40V116Z" fill={MID} />
      <path d="M176 32V20" stroke={MID} strokeWidth={2} strokeLinecap="round" />
      {Array.from({ length: 9 }, (_, r) => (
        <rect
          key={r}
          x={170}
          y={46 + r * 7.5}
          width={12}
          height={2.5}
          rx={1}
          fill={SKY}
          fillOpacity={0.7}
        />
      ))}
      <path d="M0 114Q60 108 120 114T240 112V124H0Z" fill={MID} />
      <rect x={0} y={122} width={240} height={60} fill={BLUE} />
      <g className="i-ripple">
        <path
          d={ripple(132, 1.5, 26)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.6}
          strokeOpacity={0.5}
        />
        <path
          d={ripple(152, 1.5, 34, -90)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.6}
          strokeOpacity={0.35}
        />
        <path
          d="M58 128H82M62 136H78M66 144H74"
          stroke={AMBER}
          strokeWidth={2}
          strokeLinecap="round"
          strokeOpacity={0.8}
        />
      </g>
      <g className="i-pirogue">
        <path
          d="M112 150L148 122"
          stroke={NAVY}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path d="M108 154L114 148L118 152L112 158Z" fill={NAVY} />
        <path
          d="M132 142C132 132 134 128 139 128C144 128 146 132 146 142Z"
          fill={CORAL}
        />
        <circle cx={139} cy={122} r={5} fill={SKIN_A} />
        <path
          d="M96 142Q140 152 186 140L182 148Q140 158 102 150Z"
          fill={NAVY}
        />
        <path
          d="M100 145Q140 154 184 143"
          fill="none"
          stroke={AMBER}
          strokeWidth={2}
        />
      </g>
      <path d="M0 160Q30 150 70 162L80 182H0Z" fill={NAVY} />
      <path d="M190 166Q216 154 240 158V182H186Z" fill={NAVY} />
      <Palm x={30} y={164} h={78} lean={10} />
      <Palm x={54} y={166} h={56} lean={-6} s={0.8} />
      <Palm x={216} y={162} h={64} lean={-8} s={0.85} />
    </SceneClip>
  );
}

function PointeNoire() {
  return (
    <SceneClip id="ill-pointe-noire-clip">
      <circle cx={70} cy={42} r={14} fill={AMBER} />
      <Cloud x={100} y={40} s={0.5} />
      <rect x={0} y={96} width={240} height={90} fill={BLUE} />
      <path d="M0 96H240" stroke={SKY} strokeWidth={2} />
      <g className="i-ship">
        <path d="M70 94H98L95 99H73Z" fill={NAVY} />
        <rect x={76} y={89} width={6} height={5} fill={RED} />
        <rect x={83} y={89} width={6} height={5} fill={AMBER} />
        <rect x={90} y={89} width={5} height={5} fill={SKY} />
      </g>
      <rect x={138} y={108} width={110} height={16} fill={NAVY} />
      {[
        [150, RED],
        [162, SKY],
        [174, AMBER],
        [214, BLUE],
        [226, CORAL],
      ].map(([x, c], i) => (
        <rect
          key={i}
          x={x as number}
          y={i % 2 ? 98 : 100}
          width={12}
          height={i % 2 ? 10 : 8}
          fill={c as string}
          stroke={NAVY}
          strokeWidth={1}
        />
      ))}
      <g>
        <path
          d="M186 108V56M206 108V56M186 80H206M186 56L206 80"
          fill="none"
          stroke={RED}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <rect x={150} y={52} width={74} height={6} fill={RED} />
        <path
          d="M196 52L196 38L224 52M196 38L150 52"
          fill="none"
          stroke={RED}
          strokeWidth={2}
        />
        <rect x={198} y={58} width={10} height={8} fill={NAVY} />
        <g className="i-trolley">
          <rect x={160} y={57} width={10} height={5} fill={NAVY} />
          <path d="M165 62V84" stroke={NAVY} strokeWidth={1.5} />
          <rect
            x={158}
            y={84}
            width={14}
            height={7}
            fill={AMBER}
            stroke={NAVY}
            strokeWidth={1}
          />
        </g>
      </g>
      <g>
        <path
          d="M222 108V70M236 108V70"
          fill="none"
          stroke={AMBER}
          strokeWidth={3}
        />
        <rect x={204} y={66} width={40} height={5} fill={AMBER} />
      </g>
      <g className="i-wave">
        <path
          d={ripple(112, 1.6, 26)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.6}
          strokeOpacity={0.5}
        />
        <path
          d={ripple(128, 1.6, 32, -90)}
          fill="none"
          stroke={SKY}
          strokeWidth={1.6}
          strokeOpacity={0.4}
        />
      </g>
      <path d="M0 132C50 128 100 142 150 182H0Z" fill={AMBER} />
      <path
        d="M0 132C50 128 100 142 150 182H0Z"
        fill={WHITE}
        fillOpacity={0.45}
      />
      <g className="i-foam">
        <path
          d="M0 132C50 128 100 142 150 182"
          fill="none"
          stroke={WHITE}
          strokeWidth={4}
          strokeLinecap="round"
        />
      </g>
      <path
        d="M20 170h10M46 160h8M70 172h8"
        stroke={AMBER}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Palm x={36} y={166} h={86} lean={14} />
      <Palm x={66} y={170} h={58} lean={-8} s={0.8} />
    </SceneClip>
  );
}

function Famille() {
  return (
    <>
      <Blob />
      <Shadow cx={124} cy={153} rx={70} />
      <rect x={74} y={116} width={11} height={36} rx={5} fill={NAVY} />
      <rect x={89} y={116} width={11} height={36} rx={5} fill={NAVY} />
      <path
        d="M68 122C68 86 74 70 87 70C100 70 106 86 106 122Z"
        fill={CORAL}
        {...OL}
      />
      <rect x={82} y={60} width={10} height={12} fill={SKIN_A} />
      <circle cx={87} cy={50} r={13} fill={SKIN_A} />
      <path
        d="M74 48C74 36 82 32 88 32C96 32 101 38 100 46C94 42 82 42 74 48Z"
        fill={NAVY}
      />
      <circle cx={92} cy={30} r={7} fill={NAVY} />
      <rect x={161} y={126} width={9} height={26} rx={4.5} fill={NAVY} />
      <rect x={173} y={126} width={9} height={26} rx={4.5} fill={NAVY} />
      <path
        d="M156 132C156 108 160 96 171 96C182 96 186 108 186 132Z"
        fill={BLUE}
        {...OL}
      />
      <rect x={167} y={88} width={8} height={10} fill={SKIN_B} />
      <circle cx={171} cy={80} r={11} fill={SKIN_B} />
      <circle cx={163} cy={72} r={5} fill={NAVY} />
      <circle cx={171} cy={68} r={6} fill={NAVY} />
      <circle cx={179} cy={72} r={5} fill={NAVY} />
      <g className="i-box">
        <Box x={106} y={96} w={38} h={30} dx={10} dy={7} sw={2} label={false} />
      </g>
      <path
        d="M100 82Q104 102 110 110"
        fill="none"
        stroke={SKIN_A}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d="M162 104Q156 112 150 116"
        fill="none"
        stroke={SKIN_B}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <g transform="translate(130 56)">
        <path
          className="i-heart"
          d="M0 6C-8 0 -12 -4 -12 -9A6 6 0 0 1 0 -11A6 6 0 0 1 12 -9C12 -4 8 0 0 6Z"
          fill={CORAL}
          {...OL2}
        />
      </g>
      <Spark x={52} y={70} s={0.7} />
      <Spark x={200} y={58} s={0.6} color={SKY} cls="i-spark i-spark-b" />
    </>
  );
}

function Pallet({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={4} rx={1} fill={AMBER} {...OL2} />
      <rect x={x + 2} y={y + 4} width={7} height={5} fill={AMBER} {...OL2} />
      <rect
        x={x + w / 2 - 3.5}
        y={y + 4}
        width={7}
        height={5}
        fill={AMBER}
        {...OL2}
      />
      <rect
        x={x + w - 9}
        y={y + 4}
        width={7}
        height={5}
        fill={AMBER}
        {...OL2}
      />
      <rect x={x} y={y + 9} width={w} height={3} rx={1} fill={AMBER} {...OL2} />
      <rect
        x={x}
        y={y + 4}
        width={w}
        height={5}
        fill={NAVY}
        fillOpacity={0.12}
      />
    </g>
  );
}

function Entreprise() {
  return (
    <>
      <Blob />
      <Shadow cx={120} cy={152} rx={92} />
      <Pallet x={18} y={138} w={72} />
      <Box x={22} y={114} w={28} h={24} dx={8} dy={5} sw={2} label={false} />
      <Box x={52} y={114} w={28} h={24} dx={8} dy={5} sw={2} label={false} />
      <Box x={26} y={90} w={26} h={24} dx={8} dy={5} sw={2} label={false} />
      <Box x={54} y={94} w={24} h={20} dx={8} dy={5} sw={2} label={false} />
      <g className="i-forks">
        <Pallet x={94} y={126} w={44} />
        <rect x={94} y={131} width={44} height={3} fill={NAVY} />
        <Box x={98} y={104} w={28} h={22} dx={8} dy={5} sw={2} label={false} />
        <rect x={132} y={100} width={8} height={36} rx={1.5} fill={NAVY} />
      </g>
      <rect x={140} y={66} width={7} height={82} rx={1.5} fill={NAVY} />
      <path
        d="M152 120L156 80H194L200 120"
        fill="none"
        stroke={NAVY}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <rect x={152} y={76} width={46} height={5} rx={2} fill={NAVY} />
      <rect x={168} y={100} width={6} height={18} rx={2} fill={MID} />
      <rect x={164} y={98} width={14} height={4} rx={2} fill={MID} />
      <path d="M146 142V118H208A8 8 0 0 1 216 126V142Z" fill={AMBER} {...OL} />
      <rect
        x={146}
        y={118}
        width={70}
        height={5}
        fill={WHITE}
        fillOpacity={0.3}
      />
      <rect x={206} y={122} width={10} height={20} rx={2} fill={NAVY} />
      <rect x={152} y={128} width={20} height={4} rx={2} fill={RED} />
      <circle cx={162} cy={145} r={10} fill={NAVY} />
      <circle cx={162} cy={145} r={4} fill={MIST} />
      <circle cx={200} cy={146} r={8} fill={NAVY} />
      <circle cx={200} cy={146} r={3} fill={MIST} />
      <circle cx={204} cy={110} r={3} fill={CORAL} className="i-beacon" />
    </>
  );
}

function Calendrier() {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c;
      if (idx > 32) continue;
      const x = 66 + c * 14.3;
      const y = 72 + r * 14;
      const isDate = r === 2 && c === 4;
      const isDep = r === 1 && c === 1;
      cells.push(
        <rect
          key={idx}
          x={r1(x)}
          y={y}
          width={10}
          height={10}
          rx={2.5}
          fill={isDate ? CORAL : isDep ? BLUE : LINE}
        />,
      );
    }
  }
  const dx = 66 + 4 * 14.3 + 5;
  const dy = 72 + 2 * 14 + 5;
  return (
    <>
      <Blob />
      <Shadow cx={116} cy={160} rx={64} />
      <rect
        x={56}
        y={36}
        width={116}
        height={118}
        rx={10}
        fill={WHITE}
        {...OL}
      />
      <path
        d="M66 36H162A10 10 0 0 1 172 46V60H56V46A10 10 0 0 1 66 36Z"
        fill={RED}
      />
      <rect
        x={66}
        y={46}
        width={30}
        height={4}
        rx={2}
        fill={WHITE}
        fillOpacity={0.8}
      />
      <rect
        x={56}
        y={36}
        width={116}
        height={118}
        rx={10}
        fill="none"
        {...OL}
      />
      <rect x={80} y={26} width={7} height={18} rx={3.5} fill={NAVY} />
      <rect x={141} y={26} width={7} height={18} rx={3.5} fill={NAVY} />
      {cells}
      <g transform="translate(85.3 91) rotate(45) scale(0.32)">
        <path
          d="M0 -12C1.6 -12 2.2 -10 2.2 -7L2.2 -2L13 4.5V7.5L2.2 3.4V8.5L5.4 11V13L0 11.6L-5.4 13V11L-2.2 8.5V3.4L-13 7.5V4.5L-2.2 -2V-7C-2.2 -10 -1.6 -12 0 -12Z"
          fill={WHITE}
        />
      </g>
      <path
        className="i-circle"
        d={`M${r1(dx + 9)} ${dy - 6}C${r1(dx + 14)} ${dy + 4} ${r1(dx + 6)} ${dy + 11} ${r1(dx - 2)} ${dy + 10}C${r1(dx - 12)} ${dy + 9} ${r1(dx - 13)} ${dy - 2} ${r1(dx - 7)} ${dy - 8}C${r1(dx - 2)} ${dy - 12} ${r1(dx + 8)} ${dy - 11} ${r1(dx + 12)} ${dy - 4}`}
        fill="none"
        stroke={RED}
        strokeWidth={2.4}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100"
      />
      <path
        className="i-trail"
        d="M104 26Q136 4 168 30"
        fill="none"
        stroke={SKY}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="2 6"
      />
      <g transform="translate(188 36)">
        <g className="i-badge">
          <circle r={18} fill={BLUE} {...OL} />
          <g transform="rotate(45) scale(0.95)">
            <path
              d="M0 -12C1.6 -12 2.2 -10 2.2 -7L2.2 -2L13 4.5V7.5L2.2 3.4V8.5L5.4 11V13L0 11.6L-5.4 13V11L-2.2 8.5V3.4L-13 7.5V4.5L-2.2 -2V-7C-2.2 -10 -1.6 -12 0 -12Z"
              fill={WHITE}
            />
          </g>
        </g>
      </g>
      <Spark x={40} y={96} s={0.7} />
      <Spark x={196} y={120} s={0.55} color={CORAL} cls="i-spark i-spark-b" />
    </>
  );
}

const RENDERERS: Record<IllustrationName, () => JSX.Element> = {
  colis: Colis,
  balance: Balance,
  metre: Metre,
  avion: Avion,
  navire: Navire,
  conteneur: Conteneur,
  agence: Agence,
  remise: Remise,
  douane: Douane,
  suivi: Suivi,
  message: Message,
  paiement: Paiement,
  vide: Vide,
  succes: Succes,
  paris: Paris,
  brazzaville: Brazzaville,
  "pointe-noire": PointeNoire,
  famille: Famille,
  entreprise: Entreprise,
  calendrier: Calendrier,
};

export function Illustration({
  name,
  className,
  title,
  animated = true,
}: {
  name: IllustrationName;
  className?: string;
  title?: string;
  animated?: boolean;
}): JSX.Element {
  const Render = RENDERERS[name];
  const classes = [
    "ill",
    `ill-${name}`,
    animated ? "" : "is-static",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const, focusable: "false" as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 180"
      width="100%"
      className={classes}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}
      <Render />
    </svg>
  );
}
