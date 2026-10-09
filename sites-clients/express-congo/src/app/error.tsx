"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container section">
      <h1>La page n’a pas pu être chargée.</h1>
      <p>
        Votre demande peut être réessayée. Si le problème persiste, consultez
        une agence.
      </p>
      <div className="actions">
        <button className="button" onClick={reset}>
          Réessayer
        </button>
        <Link href="/contact">Consulter les contacts</Link>
      </div>
    </div>
  );
}
