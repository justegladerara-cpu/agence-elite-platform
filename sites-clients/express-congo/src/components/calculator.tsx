"use client";
import Link from "next/link";
import { useState } from "react";
import { emptyParcel, ParcelInput, volume } from "@/domain/measurements";
import { ParcelFields } from "./parcel-fields";
import { useRouter } from "next/navigation";
export function Calculator() {
  const [parcels, setParcels] = useState<ParcelInput[]>([emptyParcel()]),
    [checked, setChecked] = useState(false),
    [result, setResult] = useState("");
  const router = useRouter();
  function calculate() {
    setChecked(true);
    try {
      const value = volume(parcels);
      setResult(value);
      return value;
    } catch {
      setResult("");
      return null;
    }
  }
  return (
    <section className="calculator card" aria-labelledby="calculator-title">
      <div className="section-heading">
        <span className="eyebrow">Un volume, pas un tarif</span>
        <h2 id="calculator-title">Calculez le volume de vos colis</h2>
        <p>
          Dimensions extérieures de l’envoi emballé. La virgule décimale est
          acceptée.
        </p>
      </div>
      <ParcelFields
        parcels={parcels}
        onChange={(p) => {
          setParcels(p);
          setResult("");
        }}
        showErrors={checked}
      />
      <div className="actions">
        <button
          className="button secondary"
          type="button"
          disabled={parcels.length >= 50}
          onClick={() => setParcels([...parcels, emptyParcel()])}
        >
          + Ajouter une ligne
        </button>
        <button className="button" onClick={calculate}>
          Calculer le volume
        </button>
      </div>
      <div role="status" aria-live="polite">
        {result && (
          <div className="result">
            <span>Volume total</span>
            <strong>{result.replace(".", ",")} m³</strong>
            <small>
              Les tarifs et le poids volumétrique restent à confirmer.
            </small>
          </div>
        )}
      </div>
      <div className="actions">
        <button
          className="button secondary"
          onClick={() => {
            if (calculate()) {
              sessionStorage.setItem("ec-parcels", JSON.stringify(parcels));
              router.push("/devis");
            }
          }}
        >
          Ajouter ces colis à mon devis
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (calculate()) window.print();
          }}
        >
          Imprimer le récapitulatif
        </button>
        <Link href="/contact">Demander conseil →</Link>
      </div>
    </section>
  );
}
