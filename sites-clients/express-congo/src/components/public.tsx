import Link from "next/link";
import Image from "next/image";
import { content, observed, formatPhone } from "@/content";
import { production } from "@/config";
import { tariffs, euros, fromPrice } from "@/content/tariffs";
export function ServiceCards() {
  return (
    <div className="three-col">
      {content.services.map((s) => (
        <article className="card service-card" key={s.slug}>
          <div className="service-top">
            <Image src={"/assets/" + s.icon} width={44} height={44} alt="" />
          </div>
          <h3>{s.name}</h3>
          <p>{s.intro}</p>
          <div className="service-meta">
            {s.formats}
            <span>{fromPrice[s.key] || "Sur devis"}</span>
          </div>
          <Link href={"/services/" + s.slug}>
            Découvrir la solution <span aria-hidden>↗</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
export function AgencyCards() {
  return (
    <div className="three-col">
      {content.agencies.map((a) => (
        <article className="card agency-card" key={a.slug}>
          <span className="eyebrow">{a.country}</span>
          <h3>{a.name}</h3>
          {!production() && (
            <>
              <p className="muted">{observed(a.address)}</p>
              <p className="agency-phone">
                <a href={"tel:" + a.phones[0]}>{formatPhone(a.phones[0])}</a>
              </p>
            </>
          )}
          <Link href={"/agences/" + a.slug}>Voir la fiche agence →</Link>
        </article>
      ))}
    </div>
  );
}
export function FAQ() {
  return (
    <div className="faq-list">
      {[
        [
          "Comment choisir entre aérien et maritime ?",
          "Décrivez votre contenu, son poids et ses dimensions. Le choix dépend du besoin et des conditions proposées. Le formulaire permet de demander conseil.",
        ],
        [
          "Puis-je obtenir un prix avec le volume ?",
          "Oui pour le groupage maritime : la grille indique 800 € pour 1 m³ ; au-delà, sur devis. En aérien, le prix dépend du poids (13 € TTC le kg) ou du nombre d’unités (10 € TTC le courrier ou le téléphone).",
        ],
        [
          "La douane est-elle toujours incluse ?",
          "Non. Les prestations douanières incluses et exclues doivent être confirmées dans la proposition.",
        ],
        [
          "Ma date souhaitée est-elle réservée ?",
          "Non. Une demande de devis ne confirme ni départ, ni livraison, ni réservation.",
        ],
        [
          "Comment consulter le suivi ?",
          "Sur la page Suivi, saisissez la référence et le code de suivi remis par votre agence. Vous voyez les étapes de votre envoi, sans aucune donnée personnelle ni localisation GPS.",
        ],
      ].map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
export function MeasureDiagram({ type = "carton" }: { type?: string }) {
  return (
    <figure className="diagram">
      <svg
        viewBox="0 0 380 250"
        role="img"
        aria-labelledby={"diagram-title-" + type}
      >
        <title id={"diagram-title-" + type}>
          {`${type} : mesurer longueur L, largeur l et hauteur H à l’extérieur de l’emballage`}
        </title>
        <defs>
          <marker
            id={"arrow-" + type}
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto-start-reverse"
          >
            <path d="M0 0L6 3L0 6" fill="#143F86" />
          </marker>
        </defs>
        <path
          d="M90 95L230 60L300 108L160 146Z"
          fill="#e6eefb"
          stroke="#143F86"
        />
        <path
          d="M90 95L160 146L160 210L90 160Z"
          fill="#c6d6ef"
          stroke="#143F86"
        />
        <path
          d="M160 146L300 108L300 172L160 210Z"
          fill="#f1f5fd"
          stroke="#143F86"
        />
        {type === "palette" && (
          <path
            d="M80 166L158 222L315 178L315 194L158 238L80 181Z"
            fill="#cabba1"
          />
        )}
        {type === "objet irrégulier" && (
          <path
            d="M170 145C120 90 215 65 250 105S215 150 195 180"
            fill="none"
            stroke="#E21E26"
            strokeWidth="6"
          />
        )}
        {type === "plusieurs colis" && (
          <path
            d="M165 146V210M235 127V190M190 70L260 118"
            stroke="#143F86"
            strokeWidth="3"
          />
        )}
        <g
          stroke="#143F86"
          markerStart={"url(#arrow-" + type + ")"}
          markerEnd={"url(#arrow-" + type + ")"}
        >
          <path d="M170 232L306 195" />
          <path d={type === "palette" ? "M62 95V181" : "M62 95V160"} />
          <path d="M76 179L141 225" />
        </g>
        <g fill="#143F86" fontSize="15" fontFamily="sans-serif">
          <text x="240" y="232">
            L
          </text>
          <text x="34" y="140">
            H
          </text>
          <text x="76" y="226">
            l
          </text>
        </g>
      </svg>
      <figcaption>
        {type.charAt(0).toUpperCase() + type.slice(1)} · L : longueur, l :
        largeur, H : hauteur.
      </figcaption>
    </figure>
  );
}

/* Tracé schématique : positions calculées à partir des longitudes et
   latitudes réelles des trois agences (x = 80 + lon × 20, y = 40 + (52 − lat) × 7,4). */
export function RouteMap() {
  const dots: { x: number; y: number }[] = [];
  for (let x = 20; x <= 540; x += 26)
    for (let y = 20; y <= 500; y += 26) dots.push({ x, y });
  return (
    <svg
      className="hero-map"
      viewBox="0 0 560 520"
      role="img"
      aria-labelledby="route-map-title"
    >
      <title id="route-map-title">
        Schéma de liaison entre l’agence de Paris et les agences de Brazzaville
        et Pointe-Noire, en République du Congo
      </title>
      <g fill="#3a5a96">
        {dots.map((d) => (
          <circle key={d.x + "-" + d.y} cx={d.x} cy={d.y} r="1.4" />
        ))}
      </g>
      <line
        x1="0"
        x2="560"
        y1="425"
        y2="425"
        stroke="#4a68a3"
        strokeDasharray="2 6"
      />
      <text x="548" y="416" textAnchor="end" fill="#6f86b5" fontSize="12">
        Équateur
      </text>
      <path
        className="route"
        d="M127 63 C 60 230, 250 330, 386 456"
        fill="none"
        stroke="#ff4b53"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        className="route"
        d="M386 456 C 360 476, 335 474, 317 460"
        fill="none"
        stroke="#ff4b53"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {[
        {
          x: 127,
          y: 63,
          name: "Paris",
          note: "France",
          anchor: "start",
          dx: 18,
        },
        {
          x: 386,
          y: 456,
          name: "Brazzaville",
          note: "République du Congo",
          anchor: "start",
          dx: 18,
        },
        {
          x: 317,
          y: 460,
          name: "Pointe-Noire",
          note: "République du Congo",
          anchor: "end",
          dx: -18,
        },
      ].map((c) => (
        <g key={c.name}>
          <circle cx={c.x} cy={c.y} r="14" fill="#ff4b53" opacity="0.18" />
          <circle cx={c.x} cy={c.y} r="6" fill="#ffffff" />
          <text
            x={c.x + c.dx}
            y={c.y - 2}
            textAnchor={c.anchor as "start" | "end"}
            fill="#ffffff"
            fontSize="19"
            fontWeight="650"
            fontFamily="Archivo, Arial, sans-serif"
            style={{ fontStretch: "112%" }}
          >
            {c.name}
          </text>
          <text
            x={c.x + c.dx}
            y={c.y + 17}
            textAnchor={c.anchor as "start" | "end"}
            fill="#9fb8e6"
            fontSize="13"
          >
            {c.note}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* Grille tarifaire officielle, une carte par solution. */
export function TariffTables() {
  return (
    <div className="tariff-grid">
      {tariffs.map((s) => (
        <section className="tariff-card card" key={s.service}>
          <header>
            <span className="eyebrow">{s.subtitle}</span>
            <h2>{s.title}</h2>
          </header>
          {s.groups.map((g) => (
            <table className="tariff-table" key={g.title}>
              <caption>{g.title}</caption>
              {g.unitLabel && (
                <thead>
                  <tr>
                    <th scope="col">Prestation</th>
                    <th scope="col">{g.unitLabel}</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.key}>
                    <th scope="row">{l.label}</th>
                    <td className={l.priceMinor === null ? "on-quote" : ""}>
                      {l.priceMinor === null
                        ? "Sur devis"
                        : euros(l.priceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {g.note && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>{g.note}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ))}
          <Link href={"/devis?service=" + s.service}>
            Demander un devis {s.title.toLowerCase()} →
          </Link>
        </section>
      ))}
    </div>
  );
}
