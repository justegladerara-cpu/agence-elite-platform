import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container section">
      <span className="eyebrow">Erreur 404</span>
      <h1>Cette page n’est pas disponible.</h1>
      <p>Vous pouvez préparer un envoi ou consulter une agence.</p>
      <div className="actions">
        <Link className="button" href="/devis">
          Demander un devis
        </Link>
        <Link href="/agences">Trouver une agence</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </div>
  );
}
