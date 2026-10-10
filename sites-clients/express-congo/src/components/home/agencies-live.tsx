"use client";
import { useEffect, useState } from "react";
import { content, formatPhone } from "@/content";

/*
 * Agences avec heure locale et état « ouvert / fermé » calculé en direct.
 * Horaires publiés sur le site officiel : du lundi au samedi, 9 h – 17 h sans
 * interruption, dans le fuseau de chaque agence. Jours fériés non connus :
 * l’état est indicatif et le dit.
 */
const OPEN = 9 * 60,
  CLOSE = 17 * 60;

function localState(timeZone: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const sunday = parts.weekday.startsWith("dim");
  const open = !sunday && minutes >= OPEN && minutes < CLOSE;
  let next = "";
  if (open) next = `Fermeture à 17 h, dans ${fmt(CLOSE - minutes)}.`;
  else if (!sunday && minutes < OPEN)
    next = `Ouverture à 9 h, dans ${fmt(OPEN - minutes)}.`;
  else
    next =
      parts.weekday.startsWith("sam") || sunday
        ? "Réouverture lundi à 9 h."
        : "Réouverture demain à 9 h.";
  return { time: `${parts.hour} h ${parts.minute}`, open, next };
}
const fmt = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`
    : `${m} min`;

export function AgenciesLive() {
  const agencies = content.agencies;
  const [active, setActive] = useState(agencies[0].slug);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const a = agencies.find((x) => x.slug === active)!;
  const state = now ? localState(a.timezone, now) : null;

  return (
    <div className="xa">
      <div className="xa-tabs" role="tablist" aria-label="Agences">
        {agencies.map((x) => {
          const s = now ? localState(x.timezone, now) : null;
          return (
            <button
              key={x.slug}
              type="button"
              role="tab"
              id={"xa-tab-" + x.slug}
              aria-selected={active === x.slug}
              aria-controls="xa-panel"
              className={active === x.slug ? "on" : ""}
              onClick={() => setActive(x.slug)}
            >
              <span className="xa-tab-name">{x.name}</span>
              <span
                className={"xa-dot" + (s ? (s.open ? " open" : " closed") : "")}
                aria-hidden
              />
              <span className="xa-tab-time">{s ? s.time : "—"}</span>
            </button>
          );
        })}
      </div>
      <div
        className="xa-panel"
        id="xa-panel"
        role="tabpanel"
        aria-labelledby={"xa-tab-" + a.slug}
        key={a.slug}
      >
        <div className="xa-status">
          {state ? (
            <>
              <strong className={state.open ? "open" : "closed"}>
                {state.open ? "Ouvert maintenant" : "Fermé"}
              </strong>
              <span>
                Il est {state.time} à {a.name}. {state.next}
              </span>
            </>
          ) : (
            <span>Du lundi au samedi, 9 h – 17 h</span>
          )}
        </div>
        <p className="xa-address">{a.address}</p>
        <div className="xa-actions">
          <a className="button small" href={"tel:" + a.phones[0]}>
            Appeler {formatPhone(a.phones[0])}
          </a>
          <a
            className="button small secondary"
            href={
              "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(a.address)
            }
            target="_blank"
            rel="noreferrer"
          >
            Itinéraire
          </a>
          <a className="xa-more" href={"/agences/" + a.slug + "/"}>
            Fiche de l’agence
          </a>
        </div>
        <p className="xa-note">
          Horaires publiés sur le site d’Express Congo. Jours fériés non pris en
          compte : appelez avant de vous déplacer.
        </p>
      </div>
    </div>
  );
}
