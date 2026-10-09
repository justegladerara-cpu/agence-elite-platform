import Link from "next/link";
import { ServiceCards, AgencyCards, FAQ, RouteMap } from "@/components/public";
import { CTA } from "@/components/shell";
export const metadata = { alternates: { canonical: "/" } };
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Fret aérien, maritime et conteneurs</span>
            <h1>Vos envois de la France vers le Congo</h1>
            <p>
              Décrivez ce que vous envoyez. Notre équipe étudie votre demande et
              vous propose une solution adaptée, avec ses conditions précisées
              avant le départ.
            </p>
            <div className="actions">
              <Link className="button" href="/devis">
                Demander un devis
              </Link>
              <Link className="plain-link" href="/suivi">
                Suivre un envoi →
              </Link>
            </div>
            <ul className="hero-facts" aria-label="En bref">
              <li>
                <b>Devis gratuit</b>
                <span>Proposition écrite et détaillée</span>
              </li>
              <li>
                <b>3 solutions</b>
                <span>Aérien, groupage maritime, conteneur</span>
              </li>
              <li>
                <b>3 agences</b>
                <span>Paris, Brazzaville, Pointe-Noire</span>
              </li>
            </ul>
          </div>
          <RouteMap />
        </div>
      </section>
      <nav className="container quick" aria-label="Accès directs">
        <div className="quick-grid">
          <Link className="quick-main" href="/devis">
            <strong>Demander un devis</strong>
            <span>En 5 étapes, sans créer de compte.</span>
          </Link>
          <Link href="/suivi">
            <strong>Suivre mon envoi</strong>
            <span>Avec la référence et le code de suivi.</span>
          </Link>
          <Link href="/prendre-les-mesures">
            <strong>Calculer mon volume</strong>
            <span>Dimensions de vos cartons et palettes.</span>
          </Link>
          <Link href="/agences">
            <strong>Trouver une agence</strong>
            <span>Paris, Brazzaville et Pointe-Noire.</span>
          </Link>
        </div>
      </nav>
      <section className="container section">
        <div className="section-heading split">
          <div>
            <span className="eyebrow">Nos solutions</span>
            <h2>Un mode de transport pour chaque envoi</h2>
          </div>
          <Link href="/services">Comparer les solutions</Link>
        </div>
        <ServiceCards />
      </section>
      <section className="steps-section">
        <div className="container section">
          <div className="section-heading">
            <span className="eyebrow">Comment ça se passe</span>
            <h2>Quatre étapes, de la demande au retrait</h2>
          </div>
          <div className="four-col steps">
            {[
              [
                "Décrivez votre envoi",
                "Contenu, dimensions, poids et destination.",
                "/devis",
              ],
              [
                "Validez la proposition",
                "Prix, prestations et conditions détaillés.",
                "/tarifs",
              ],
              [
                "Déposez vos colis",
                "Selon les instructions de votre agence.",
                "/preparer-mon-envoi",
              ],
              [
                "Suivez l’acheminement",
                "Les étapes enregistrées par nos agences.",
                "/suivi",
              ],
            ].map(([title, text, href], i) => (
              <Link href={href} key={title}>
                <span>{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="container section preparation">
        <div>
          <span className="eyebrow">Avant de déposer vos colis</span>
          <h2>Un envoi bien mesuré, une proposition plus juste</h2>
          <p>
            Relevez la longueur, la largeur et la hauteur de chaque colis
            emballé. Le calculateur additionne le volume de vos cartons pour
            préparer votre demande.
          </p>
          <Link className="button secondary" href="/prendre-les-mesures">
            Mesurer mes colis
          </Link>
        </div>
        <div className="guide-links">
          {[
            ["Mesurer et calculer le volume", "/prendre-les-mesures"],
            ["Emballer et préparer les documents", "/emballage-et-documents"],
            [
              "Vérifier les marchandises acceptées",
              "/marchandises-reglementees",
            ],
          ].map(([title, href]) => (
            <Link key={href} href={href}>
              {title}
              <b aria-hidden>↗</b>
            </Link>
          ))}
        </div>
      </section>
      <section className="light-section">
        <div className="container section">
          <div className="section-heading split">
            <div>
              <span className="eyebrow">Nos agences</span>
              <h2>Une équipe en France et au Congo</h2>
            </div>
            <Link href="/agences">Toutes les agences</Link>
          </div>
          <AgencyCards />
        </div>
      </section>
      <section className="container section faq-section">
        <div>
          <span className="eyebrow">Questions fréquentes</span>
          <h2>Ce qu’il faut savoir avant d’envoyer</h2>
          <Link href="/faq">Toutes les réponses</Link>
        </div>
        <FAQ />
      </section>
      <CTA />
    </>
  );
}
