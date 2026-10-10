"use client";
import Link from "next/link";
import type { Entity } from "@/domain/operations";
import {
  Illustration,
  type IllustrationName,
} from "@/components/illustrations";
import { LiveJourney } from "@/components/live-journey";
import { date, money, services, stateLabel } from "./labels";

/*
 * Accueil de l’espace client, pensé comme une application : ce qui bouge en
 * ce moment, ce qui attend une action, et les messages de l’agence.
 */
const ORDER = [
  "cree",
  "recu-en-agence",
  "controle",
  "en-attente-de-depart",
  "expedie",
  "arrive",
  "formalites-en-cours",
  "disponible-au-retrait",
  "remis",
];
const NEXT: Record<string, string> = {
  cree: "Déposez vos colis à l’agence de Paris : ils seront pesés et mesurés.",
  "recu-en-agence": "Vos colis sont à l’agence. Le contrôle suit.",
  controle: "Contrôle fait. Le dossier rejoint le prochain départ.",
  "en-attente-de-depart": "Prêt à partir avec le prochain départ.",
  expedie: "En route vers le Congo.",
  arrive: "Arrivé : l’agence prépare la mise à disposition.",
  "formalites-en-cours": "Formalités en cours à l’arrivée.",
  "disponible-au-retrait":
    "Disponible : présentez-vous avec une pièce d’identité.",
  remis: "Remis au destinataire.",
  incident: "L’agence a besoin de vous : consultez le message.",
  "en-attente-information": "Une information manque : contactez l’agence.",
};
const ART: Record<string, IllustrationName> = {
  aerien: "avion",
  maritime: "navire",
  conteneur: "conteneur",
};

type Props = {
  name: string;
  entities: Entity[];
  whatsapp: string;
  run: (command: string, input: Record<string, unknown>) => Promise<boolean>;
  go: (view: string) => void;
  paidFor: (proposalId: string) => number;
};

export function ClientHome({
  name,
  entities,
  whatsapp,
  run,
  go,
  paidFor,
}: Props) {
  const of = (k: string) => entities.filter((e) => e.kind === k);
  const shipments = of("shipment");
  const events = of("event");
  const proposals = of("proposal");
  const messages = of("message")
    .slice()
    .sort((a, b) => String(a.payload.at).localeCompare(String(b.payload.at)));
  const active = shipments.filter(
    (s) => !["remis", "annule"].includes(String(s.payload.status)),
  );
  const done = shipments.filter((s) => s.payload.status === "remis");
  const toAccept = proposals.filter(
    (p) => p.payload.status === "proposition-envoyee",
  );
  const toPay = proposals.filter(
    (p) =>
      p.payload.status === "acceptee" &&
      paidFor(p.id) < Number(p.payload.totalMinor),
  );
  const first = name.split(/\s+/)[0] || name;
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour";
  const wa = (text: string) =>
    `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
  const lastEvent = (id: string) =>
    events
      .filter((e) => e.payload.shipmentId === id)
      .map((e) => String(e.payload.occurredAt))
      .sort()
      .pop();
  const departedAt = (id: string) =>
    events
      .filter(
        (e) => e.payload.shipmentId === id && e.payload.status === "expedie",
      )
      .map((e) => String(e.payload.occurredAt))
      .sort()
      .pop();

  return (
    <div className="ch">
      <section className="ch-hello">
        <div>
          <p className="ch-kicker">
            {hello} {first}
          </p>
          <h2>
            {active.length
              ? `${active.length} envoi${active.length > 1 ? "s" : ""} en cours`
              : "Aucun envoi en cours"}
          </h2>
          <ul className="ch-chips">
            <li>
              <button type="button" onClick={() => go("shipment")}>
                <b>{shipments.length}</b> dossiers
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("proposal")}>
                <b>{toAccept.length}</b> proposition
                {toAccept.length > 1 ? "s" : ""} à accepter
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("payment")}>
                <b>{toPay.length}</b> à régler
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("shipment")}>
                <b>{done.length}</b> remis
              </button>
            </li>
          </ul>
          <div className="ch-actions">
            <Link className="button" href="/devis">
              Nouvelle demande de devis
            </Link>
            <a
              className="button secondary whatsapp-outline"
              href={wa("Bonjour Express Congo, ")}
              target="_blank"
              rel="noreferrer"
            >
              Écrire sur WhatsApp
            </a>
          </div>
        </div>
        <Illustration name="famille" className="ch-art" />
      </section>

      {(toAccept.length > 0 || toPay.length > 0) && (
        <section className="ch-todo" aria-labelledby="ch-todo-title">
          <h3 id="ch-todo-title">À faire maintenant</h3>
          <div className="ch-todo-list">
            {toAccept.map((p) => (
              <article key={p.id} className="ch-todo-card">
                <Illustration name="douane" className="ch-todo-art" />
                <div>
                  <strong>Proposition {String(p.payload.number)}</strong>
                  <p>
                    {money(
                      Number(p.payload.totalMinor),
                      String(p.payload.currency),
                    )}{" "}
                    TTC, valable jusqu’au{" "}
                    {date(p.payload.validUntil, "paris", false)}.
                  </p>
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      void run("acceptProposal", { proposalId: p.id })
                    }
                  >
                    Accepter la proposition
                  </button>
                </div>
              </article>
            ))}
            {toPay.map((p) => (
              <article key={p.id} className="ch-todo-card">
                <Illustration name="paiement" className="ch-todo-art" />
                <div>
                  <strong>Reste à régler</strong>
                  <p>
                    {money(
                      Number(p.payload.totalMinor) - paidFor(p.id),
                      String(p.payload.currency),
                    )}{" "}
                    sur la proposition {String(p.payload.number)}.
                  </p>
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => go("payment")}
                  >
                    Voir comment payer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="ch-live-title">
        <h3 id="ch-live-title" className="ch-title">
          Mes envois en cours
        </h3>
        {active.length ? (
          <div className="ch-cards">
            {active
              .slice()
              .sort((a, b) =>
                String(lastEvent(b.id) || b.createdAt).localeCompare(
                  String(lastEvent(a.id) || a.createdAt),
                ),
              )
              .map((s) => {
                const status = String(s.payload.status);
                const step = Math.max(0, ORDER.indexOf(status));
                const departed = departedAt(s.id);
                return (
                  <article
                    key={s.id + status}
                    className={
                      "ch-card" + (status === "incident" ? " alert" : "")
                    }
                  >
                    <div className="ch-card-head">
                      <Illustration
                        name={ART[String(s.payload.service)] || "colis"}
                        className="ch-card-art"
                        animated={status === "expedie"}
                      />
                      <div>
                        <span className="ch-ref">
                          {String(s.payload.reference)}
                        </span>
                        <strong>
                          {String(
                            s.payload.description ||
                              services[String(s.payload.service)],
                          )}
                        </strong>
                        <span className="ch-meta">
                          {services[String(s.payload.service)]} vers{" "}
                          {String(s.payload.destination)}
                        </span>
                      </div>
                      <span className={"ch-state s-" + status}>
                        {s.payload.demoLive === true && (
                          <i className="live-dot" aria-hidden />
                        )}
                        {stateLabel(status)}
                      </span>
                    </div>
                    <LiveJourney
                      compact
                      service={String(s.payload.service)}
                      destination={String(s.payload.destination)}
                      status={status}
                      live={s.payload.demoLive === true}
                      transit={
                        status === "expedie" && departed
                          ? {
                              departedAt: departed,
                              expectedMs:
                                s.payload.service === "aerien"
                                  ? 9 * 3600000
                                  : 24 * 86400000,
                            }
                          : null
                      }
                    />
                    <div
                      className="ch-progress"
                      role="progressbar"
                      aria-label="Avancement"
                      aria-valuemin={0}
                      aria-valuemax={ORDER.length - 1}
                      aria-valuenow={step}
                      style={{ ["--p" as string]: step / (ORDER.length - 1) }}
                    >
                      <i />
                    </div>
                    <p className="ch-next">{NEXT[status] || ""}</p>
                    <div className="ch-card-foot">
                      <Link
                        className="ch-link"
                        href={`/suivi/?ref=${encodeURIComponent(String(s.payload.reference))}&code=${encodeURIComponent(String(s.payload.trackingCode || ""))}`}
                      >
                        Suivi en direct
                      </Link>
                      <a
                        className="ch-link"
                        href={wa(
                          `Bonjour Express Congo, j’ai une question sur mon envoi ${String(s.payload.reference)}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Question sur WhatsApp
                      </a>
                      {lastEvent(s.id) && (
                        <small>Mis à jour le {date(lastEvent(s.id))}</small>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="ch-empty">
            <Illustration name="vide" className="ch-empty-art" />
            <p>
              Aucun envoi en cours. Préparez le prochain en quelques étapes.
            </p>
            <Link className="button" href="/devis">
              Demander un devis
            </Link>
          </div>
        )}
      </section>

      {messages.length > 0 && (
        <section className="ch-chat" aria-labelledby="ch-chat-title">
          <h3 id="ch-chat-title" className="ch-title">
            Mes messages WhatsApp avec l’agence
          </h3>
          <div className="chat-thread">
            {messages.slice(-6).map((m) => (
              <div
                key={m.id}
                className={
                  "bubble " + (m.payload.direction === "in" ? "me" : "them")
                }
              >
                <p>{String(m.payload.body)}</p>
                <small>
                  {date(m.payload.at)}
                  {m.payload.direction === "out" &&
                    m.payload.status === "simule" &&
                    " (démonstration)"}
                </small>
              </div>
            ))}
          </div>
          <a
            className="button small whatsapp"
            href={wa("Bonjour Express Congo, ")}
            target="_blank"
            rel="noreferrer"
          >
            Continuer sur WhatsApp
          </a>
        </section>
      )}
    </div>
  );
}
