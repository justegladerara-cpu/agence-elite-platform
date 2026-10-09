"use client";
import Link from "next/link";
import { useState } from "react";
import { tariffs, euros } from "@/content/tariffs";

/* Lignes du fret aérien avec douane : seules à porter un prix unitaire ou au kg. */
const lines = tariffs[0].groups
  .slice(0, 2)
  .flatMap((g) => g.lines)
  .filter((l) => l.priceMinor !== null);

/** Quantité saisie (virgule acceptée) en millièmes entiers, ou null. */
function thousandths(value: string, unit: string) {
  const t = value.trim().replace(/\s/g, "");
  const ok = unit === "kg" ? /^\d{1,5}([.,]\d{1,3})?$/ : /^\d{1,4}$/;
  if (!ok.test(t)) return null;
  const [w, f = ""] = t.split(/[.,]/);
  const n = Number(w) * 1000 + Number(f.padEnd(3, "0"));
  return n > 0 ? n : null;
}

export function TariffEstimator() {
  const [key, setKey] = useState(lines[2].key),
    [quantity, setQuantity] = useState("");
  const line = lines.find((l) => l.key === key)!;
  const q = thousandths(quantity, line.unit);
  // Arrondi au centime le plus proche, calcul entier.
  const total = q === null ? null : Math.round((line.priceMinor! * q) / 1000);
  return (
    <section className="estimator card" aria-labelledby="estimator-title">
      <div>
        <span className="eyebrow">Fret aérien avec douane</span>
        <h2 id="estimator-title">Estimez votre envoi</h2>
        <p className="muted">
          Calcul direct à partir de la grille tarifaire. Le montant définitif
          est confirmé dans votre proposition, après pesée en agence.
        </p>
      </div>
      <div className="estimator-fields">
        <label>
          Type d’envoi
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {lines.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label} — {euros(l.priceMinor!)}
                {l.unit === "kg" ? " / kg" : " / unité"}
              </option>
            ))}
          </select>
        </label>
        <label>
          {line.unit === "kg" ? "Poids total (kg)" : "Nombre d’unités"}
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode={line.unit === "kg" ? "decimal" : "numeric"}
            placeholder={line.unit === "kg" ? "Ex. 23,5" : "Ex. 2"}
            aria-invalid={quantity !== "" && q === null}
          />
        </label>
      </div>
      <div className="estimator-result" aria-live="polite">
        {total !== null ? (
          <>
            <span>Estimation TTC</span>
            <b>{euros(total)}</b>
            <small>
              {quantity.replace(".", ",")}{" "}
              {line.unit === "kg" ? "kg" : "unité(s)"} ×{" "}
              {euros(line.priceMinor!)}
            </small>
          </>
        ) : (
          <>
            <span>Estimation TTC</span>
            <b>—</b>
            <small>
              {quantity
                ? "Saisissez un nombre valide."
                : "Saisissez le poids ou le nombre d’unités."}
            </small>
          </>
        )}
        <Link className="button small" href="/devis?service=aerien">
          Demander ma proposition
        </Link>
      </div>
    </section>
  );
}
