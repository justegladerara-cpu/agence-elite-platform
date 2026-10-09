"use client";
/* Graphiques à une seule série : une teinte (bleu nuit), valeurs visibles,
   info-bulle au survol et résumé textuel pour les lecteurs d’écran. */
export type Bar = {
  key: string;
  label: string;
  value: number;
  display?: string;
  onSelect?: () => void;
};
export function HBars({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul
      className="hbars"
      aria-label={
        title +
        " : " +
        bars.map((b) => `${b.label} ${b.display ?? b.value}`).join(", ")
      }
    >
      {bars.map((b) => {
        const inner = (
          <>
            <span className="hbar-label">{b.label}</span>
            <span className="hbar-track" aria-hidden>
              <span
                className="hbar-fill"
                style={{ width: `${(b.value / max) * 100}%` }}
              />
            </span>
            <span className="hbar-value">{b.display ?? b.value}</span>
          </>
        );
        return (
          <li key={b.key} title={`${b.label} : ${b.display ?? b.value}`}>
            {b.onSelect ? (
              <button type="button" onClick={b.onSelect}>
                {inner}
              </button>
            ) : (
              <div>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
export function Columns({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const total = bars.reduce((s, b) => s + b.value, 0);
  return (
    <figure className="columns" aria-label={`${title} : ${total} au total`}>
      <div className="columns-plot">
        {bars.map((b) => (
          <div
            className="column"
            key={b.key}
            title={`${b.label} : ${b.display ?? b.value}`}
          >
            {b.value > 0 && <span className="column-value">{b.value}</span>}
            <span
              className="column-fill"
              style={{ height: `${(b.value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="columns-axis" aria-hidden>
        {bars.map((b, i) => (
          <span key={b.key}>{i % 2 === 0 ? b.label : ""}</span>
        ))}
      </div>
    </figure>
  );
}
