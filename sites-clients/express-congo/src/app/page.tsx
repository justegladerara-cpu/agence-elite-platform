import Link from "next/link";
import { FAQ } from "@/components/public";
import { CTA } from "@/components/shell";
import { RouteHero } from "@/components/home/route-hero";
import { ServicesShowcase } from "@/components/home/services-showcase";
import { AgenciesLive } from "@/components/home/agencies-live";
import {
  Illustration,
  type IllustrationName,
} from "@/components/illustrations";
const STEP_ART: IllustrationName[] = ["colis", "douane", "agence", "suivi"];
export const metadata = { alternates: { canonical: "/" } };

const STEPS = [
  [
    "Décrivez votre envoi",
    "Contenu, dimensions, poids et destination.",
    "/devis",
  ],
  [
    "Validez la proposition",
    "Prix, prestations et conditions détaillés par écrit.",
    "/tarifs",
  ],
  [
    "Déposez vos colis",
    "À l’agence, selon les instructions reçues.",
    "/preparer-mon-envoi",
  ],
  [
    "Suivez l’acheminement",
    "Chaque étape enregistrée par nos agences.",
    "/suivi",
  ],
];

export default function Home() {
  return (
    <>
      <RouteHero />

      <section className="home-section" aria-labelledby="solutions-title">
        <div className="container">
          <div className="home-head">
            <div>
              <h2 id="solutions-title">
                Un mode de transport pour chaque envoi
              </h2>
              <p>
                Choisissez une solution : les prix affichés viennent de la
                grille Express Congo.
              </p>
            </div>
            <Link href="/services">Comparer les solutions</Link>
          </div>
          <ServicesShowcase />
        </div>
      </section>

      <section className="home-section tint" aria-labelledby="etapes-title">
        <div className="container">
          <div className="home-head">
            <h2 id="etapes-title">
              De la demande au retrait, en quatre étapes
            </h2>
            <Link href="/prendre-les-mesures">Mesurer mes colis</Link>
          </div>
          <ol className="xsteps">
            {STEPS.map(([title, text, href], i) => (
              <li key={title}>
                <Link href={href}>
                  <Illustration name={STEP_ART[i]} className="xsteps-art" />
                  <span className="num" aria-hidden>
                    {i + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section" aria-labelledby="agences-title">
        <div className="container">
          <div className="home-head">
            <div>
              <h2 id="agences-title">Une équipe en France et au Congo</h2>
              <p>L’heure locale et l’ouverture de chaque agence, en direct.</p>
            </div>
            <Link href="/agences">Toutes les agences</Link>
          </div>
          <AgenciesLive />
        </div>
      </section>

      <section className="container section faq-section">
        <div>
          <h2>Ce qu’il faut savoir avant d’envoyer</h2>
          <Link href="/faq">Toutes les réponses</Link>
        </div>
        <FAQ />
      </section>
      <CTA />
    </>
  );
}
