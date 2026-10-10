import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { content, observed, publicPaths, formatPhone } from "@/content";
import { Calculator } from "@/components/calculator";
import { QuoteForm } from "@/components/quote-form";
import {
  ServiceCards,
  AgencyCards,
  FAQ,
  MeasureDiagram,
  TariffTables,
} from "@/components/public";
import { TariffEstimator } from "@/components/tariff-estimator";
import { tariffSource, fromPrice } from "@/content/tariffs";
import { CTA } from "@/components/shell";
import { TrackingForm } from "@/components/tracking";
import {
  Illustration,
  type IllustrationName,
} from "@/components/illustrations";
import { trackingEnabled } from "@/server/tracking";
import { production } from "@/config";
import { db } from "@/server/database";
export const dynamic = "force-dynamic";
const titles: Record<string, string> = {
  services: "Nos solutions de fret",
  devis: "Décrivez votre envoi",
  tarifs: "Tarifs",
  suivi: "Suivre une expédition",
  "prendre-les-mesures": "Bien mesurer. Mieux préparer.",
  agences: "Nos agences",
  professionnels: "Vos envois professionnels",
  faq: "Questions fréquentes",
  contact: "Parlons de votre envoi",
  "espace-client": "Votre espace client",
};
const subtitles: Record<string, string> = {
  tarifs:
    "La grille d’Express Congo : fret aérien au kilo ou à l’unité, groupage maritime au mètre cube, conteneurs sur devis.",
  suivi:
    "Consultez les étapes de votre envoi avec la référence et le code de suivi remis par votre agence.",
  contact:
    "Une agence à Paris, deux au Congo : appelez, écrivez ou décrivez votre envoi en ligne.",
  agences: "Paris pour le départ, Brazzaville et Pointe-Noire pour l’arrivée.",
};
/* Illustration d’en-tête de chaque page. */
const art: Record<string, IllustrationName> = {
  services: "conteneur",
  "services/fret-aerien": "avion",
  "services/fret-maritime": "navire",
  "services/conteneurs-complets": "conteneur",
  agences: "agence",
  "agences/paris": "paris",
  "agences/brazzaville": "brazzaville",
  "agences/pointe-noire": "pointe-noire",
  "preparer-mon-envoi": "colis",
  "prendre-les-mesures": "metre",
  "emballage-et-documents": "douane",
  "marchandises-reglementees": "colis",
  suivi: "suivi",
  tarifs: "balance",
  devis: "calendrier",
  contact: "message",
  faq: "remise",
  "a-propos": "famille",
  "espace-client": "paiement",
  professionnels: "entreprise",
};
function titleFor(path: string) {
  return (
    titles[path] ||
    content.pages.find((p) => p.slug === path)?.title ||
    content.services.find((s) => path === "services/" + s.slug)?.name ||
    content.agencies.find((a) => path === "agences/" + a.slug)?.name ||
    "Page introuvable"
  );
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = slug.join("/");
  return {
    title: titleFor(path),
    description:
      content.pages.find((p) => p.slug === path)?.description ||
      `Préparer votre envoi avec Express Congo : ${titleFor(path).toLowerCase()}.`,
    alternates: { canonical: "/" + path + "/" },
    robots:
      path === "suivi" || path === "espace-client"
        ? { index: false, follow: false }
        : undefined,
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = slug.join("/");
  if (!publicPaths.includes("/" + path) && path !== "espace-client") notFound();
  const service = content.services.find((s) => path === "services/" + s.slug),
    agency = content.agencies.find((a) => path === "agences/" + a.slug),
    page = content.pages.find((p) => p.slug === path);
  const editorial = !production()
    ? await (
        await db()
      ).get<{ title: string; body: string }>(
        "SELECT title,body FROM editorial WHERE slug=?",
        "/" + path,
      )
    : undefined;
  return (
    <>
      <section className="page-heading">
        <div className={"container" + (art[path] ? " has-art" : "")}>
          <div className="page-heading-text">
            <Link className="breadcrumb" href="/">
              Accueil
            </Link>
            <span aria-hidden> / </span>
            <span>{titleFor(path)}</span>
            <h1>{titleFor(path)}</h1>
            <p>
              {page?.description ||
                service?.intro ||
                subtitles[path] ||
                "Préparez votre besoin, puis faites confirmer les conditions de votre envoi."}
            </p>
          </div>
          {art[path] && (
            <div className="page-art">
              <Illustration name={art[path]} />
            </div>
          )}
        </div>
      </section>
      <div className="container section">
        {path === "services" && (
          <>
            <ServiceCards />
            <div className="table-wrap">
              <table>
                <caption>Comparer les solutions</caption>
                <thead>
                  <tr>
                    <th>Solution</th>
                    <th>Format</th>
                    <th>Éléments du devis</th>
                    <th>Tarification</th>
                  </tr>
                </thead>
                <tbody>
                  {content.services.map((s) => (
                    <tr key={s.key}>
                      <th>{s.name}</th>
                      <td>{s.formats}</td>
                      <td>{s.criterion}</td>
                      <td>
                        <Link href="/tarifs">
                          {fromPrice[s.key] || "Sur devis"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {service && (
          <>
            <div className="service-detail">
              <div>
                <h2>Une solution à adapter à vos marchandises</h2>
                <p>{service.body}</p>
                <h2>Pour préparer la demande</h2>
                <p>
                  Indiquez le contenu, les quantités, les dimensions extérieures
                  et le poids réel. Les dates de départ, délais, conditions de
                  dépôt et documents nécessaires restent à confirmer.
                </p>
                <h2>Destination et conditions</h2>
                <p>
                  France vers la République du Congo. Aucun sens inverse,
                  livraison à domicile ou enlèvement n’est activé. Les
                  prestations douanières et exclusions sont précisées dans la
                  proposition.
                </p>
                <h2>Une question fréquente</h2>
                <p>{service.faq}</p>
              </div>
              <div>
                <Image
                  src={"/assets/" + service.image}
                  width={720}
                  height={300}
                  alt={"Visuel source : " + service.name}
                />
                <div className="card">
                  <h3>Préparez les mesures</h3>
                  <p>Le volume facilite l’étude de la demande.</p>
                  <Link href="/prendre-les-mesures">
                    Ouvrir le calculateur →
                  </Link>
                </div>
              </div>
            </div>
            <h2>Demander une proposition</h2>
            <Link className="button" href={"/devis?service=" + service.key}>
              Préparer mon devis {service.name.toLowerCase()} →
            </Link>
          </>
        )}
        {(path === "devis" || path === "professionnels") && (
          <QuoteForm professional={path === "professionnels"} />
        )}
        {path === "tarifs" && (
          <>
            <TariffEstimator />
            <TariffTables />
            <div className="tariff-foot">
              <div>
                <h2>Ce que comprennent les prix</h2>
                <p>
                  Les prix sont indiqués en euros TTC, au départ de Paris vers
                  la République du Congo. Les droits et taxes à destination, le
                  fret sans douane et les volumes au-delà de la grille font
                  l’objet d’un devis. Chaque proposition détaille les
                  prestations incluses et exclues avant le dépôt.
                </p>
                <div className="actions">
                  <Link className="button" href="/devis">
                    Demander un devis
                  </Link>
                  <a className="plain-link" href={tariffSource.pdf} download>
                    Télécharger la grille (PDF) ↓
                  </a>
                </div>
              </div>
              <p className="source-note">
                Grille tarifaire transmise par Express Congo le 9 octobre 2026.
                Conditions générales applicables : voir les{" "}
                <Link href="/cgv">conditions générales de vente</Link>.
              </p>
            </div>
          </>
        )}
        {path === "suivi" &&
          (trackingEnabled() ? (
            <TrackingForm />
          ) : (
            <div className="reading card">
              <h2>Suivi en ligne bientôt disponible</h2>
              <p>
                En attendant, votre agence vous renseigne sur l’avancement de
                votre envoi par téléphone ou sur place.
              </p>
              <Link href="/contact">Consulter les contacts de l’agence →</Link>
            </div>
          ))}
        {path === "espace-client" && (
          <div className="reading card">
            <h2>Ouverture des comptes désactivée</h2>
            <p>
              Le portail nécessite une authentification vérifiée et le
              raccordement des dossiers. Il n’est pas encore disponible dans
              cette version. Aucune connexion factice ne donne accès à vos
              documents.
            </p>
            <Link href="/devis">
              Une demande de devis reste possible sans compte →
            </Link>
            {!production() && (
              <p>
                <Link href="/demo">
                  Tester le portail sur des dossiers fictifs →
                </Link>
              </p>
            )}
          </div>
        )}
        {path === "prendre-les-mesures" && (
          <>
            <div className="reading">
              <h2>Mesurez l’extérieur, une fois l’envoi emballé</h2>
              <p>
                Relevez longueur L, largeur l et hauteur H. Pour une palette,
                incluez son support ; pour un objet irrégulier, retenez les
                dimensions extérieures maximales.
              </p>
            </div>
            <div className="four-col">
              {["carton", "palette", "objet irrégulier", "plusieurs colis"].map(
                (type) => (
                  <MeasureDiagram key={type} type={type} />
                ),
              )}
            </div>
            <Calculator />
            <div className="reading">
              <h2>Volume et poids : deux informations différentes</h2>
              <p>
                En centimètres : L × l × H ÷ 1 000 000 = volume unitaire en m³.
                Multipliez par le nombre de colis identiques, puis additionnez
                les lignes.
              </p>
              <p>
                Un carton de 60 × 40 × 40 cm représente 0,096 m³. Trois cartons
                identiques représentent 0,288 m³.
              </p>
              <p>
                Le poids réel est mesuré en kg. Un éventuel poids volumétrique
                dépend d’une règle validée par offre ; aucun diviseur par défaut
                n’est utilisé.
              </p>
              <details>
                <summary>
                  Référence spécialisée : chargements sur palettes aériennes
                </summary>
                <Image
                  src="/assets/comment-mesurer.jpg"
                  width={768}
                  height={343}
                  alt="Illustration source des dimensions de chargements sur palettes aériennes"
                />
                <p>
                  Exemples visuels du site actuel. Ces dimensions ne sont ni des
                  limites de service confirmées ni des dimensions obligatoires
                  pour tous les colis.
                </p>
              </details>
            </div>
          </>
        )}
        {path === "agences" && <AgencyCards />}
        {agency && (
          <div className="agency-detail">
            <section className="card">
              <span className="eyebrow">{agency.country}</span>
              <h2>Agence de {agency.name}</h2>
              {!production() && (
                <>
                  <dl className="contact-list">
                    <div>
                      <dt>Adresse</dt>
                      <dd>{observed(agency.address)}</dd>
                    </div>
                    <div>
                      <dt>Téléphone</dt>
                      <dd>
                        {agency.phones.map((p) => (
                          <Link key={p} href={"tel:" + p}>
                            {formatPhone(p)}
                          </Link>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt>Horaires</dt>
                      <dd>
                        Du lundi au samedi, de 9 h à 17 h sans interruption
                        <small>
                          Heure de{" "}
                          {agency.timezone === "Europe/Paris"
                            ? "Paris"
                            : "Brazzaville"}
                        </small>
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="button secondary small"
                    href={
                      "https://www.google.com/maps/search/?api=1&query=" +
                      encodeURIComponent(agency.address)
                    }
                    rel="noreferrer"
                    target="_blank"
                  >
                    Itinéraire ↗
                  </Link>
                  <p className="source-note">{content.sourceNote}</p>
                </>
              )}
              <p>
                Déposez ou retirez vos marchandises seulement après confirmation
                des instructions de l’agence.
              </p>
            </section>
            <section>
              <h2>Avant de vous déplacer</h2>
              <p>
                Faites confirmer l’adresse, les horaires et les documents
                nécessaires. Les modalités de retrait par mandataire ne sont pas
                activées.
              </p>
              <Link className="button" href="/devis">
                Décrire mon envoi →
              </Link>
            </section>
          </div>
        )}
        {path === "faq" && <FAQ />}
        {path === "contact" && (
          <>
            <AgencyCards />
            {!production() && (
              <div className="contact-panel">
                <div className="contact-tiles">
                  <a
                    className="contact-tile"
                    href={"tel:" + content.contact.phone}
                    id="appeler"
                  >
                    <span className="eyebrow">Appeler Paris</span>
                    <b>{formatPhone(content.contact.phone)}</b>
                    <small>Du lundi au samedi, 9 h – 17 h</small>
                  </a>
                  <a
                    className="contact-tile whatsapp"
                    id="whatsapp"
                    href={`https://wa.me/${content.contact.whatsapp.slice(1)}?text=Bonjour%2C%20je%20souhaite%20des%20informations%20sur%20un%20envoi%20France%20vers%20la%20R%C3%A9publique%20du%20Congo.`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="eyebrow">WhatsApp</span>
                    <b>{formatPhone(content.contact.whatsapp)}</b>
                    <small>Réponse aux heures d’ouverture</small>
                  </a>
                  <a
                    className="contact-tile"
                    href={"mailto:" + content.contact.email}
                  >
                    <span className="eyebrow">Email</span>
                    <b>{content.contact.email}</b>
                    <small>Pour les documents et les questions écrites</small>
                  </a>
                  {content.socialObserved.map((s) => (
                    <a
                      className="contact-tile"
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="eyebrow">{s.network}</span>
                      <b>Express Congo</b>
                      <small>Actualités et départs</small>
                    </a>
                  ))}
                </div>
                <p className="source-note">
                  Un message WhatsApp ou un appel n’enregistre pas de demande :
                  pour un envoi, utilisez le formulaire de devis.{" "}
                  {content.sourceNote}
                </p>
              </div>
            )}
            <h2>Une demande structurée</h2>
            <p>
              Utilisez le formulaire pour un envoi, une question sur son contenu
              ou un besoin professionnel. Décrivez votre question dans le
              commentaire.
            </p>
            <Link className="button" href="/devis">
              Ouvrir le formulaire →
            </Link>
          </>
        )}
        {page && (
          <article className="reading">
            {page.sections.map(([title, body]) => (
              <section key={title}>
                <h2>{title}</h2>
                <p>{body}</p>
              </section>
            ))}
            {["cgv", "mentions-legales", "confidentialite"].includes(path) &&
              !production() && (
                <p className="source-note">
                  Texte établi à partir du site officiel, à faire approuver par
                  Express Congo avant la mise en service.
                </p>
              )}
            <div className="actions">
              <Link href="/prendre-les-mesures">Mesurer un envoi →</Link>
              <Link href="/devis">Préparer une demande →</Link>
            </div>
          </article>
        )}
        {editorial && (
          <aside className="notice editorial">
            <span className="eyebrow">
              Proposition éditoriale — non validée
            </span>
            <h2>{editorial.title}</h2>
            <p>{editorial.body}</p>
          </aside>
        )}
      </div>
      {!["devis", "professionnels", "espace-client"].includes(path) && <CTA />}
    </>
  );
}
