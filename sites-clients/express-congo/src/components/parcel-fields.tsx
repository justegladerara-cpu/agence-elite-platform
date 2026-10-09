"use client";
import { ParcelInput, validateParcel } from "@/domain/measurements";
export function ParcelFields({
  parcels,
  onChange,
  showErrors = false,
}: {
  parcels: ParcelInput[];
  onChange: (p: ParcelInput[]) => void;
  showErrors?: boolean;
}) {
  return (
    <div>
      {parcels.map((p, index) => {
        const errors = showErrors ? validateParcel(p) : {};
        return (
          <fieldset className="parcel" key={index}>
            <legend>Colis {index + 1}</legend>
            <div className="parcel-grid">
              {(
                [
                  ["length", "Longueur"],
                  ["width", "Largeur"],
                  ["height", "Hauteur"],
                  ["weight", "Poids réel (kg)"],
                  ["quantity", "Quantité"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} htmlFor={`p-${index}-${field}`}>
                  {label}
                  <input
                    id={`p-${index}-${field}`}
                    aria-label={label}
                    inputMode="decimal"
                    value={p[field]}
                    aria-invalid={!!errors[field]}
                    aria-describedby={
                      errors[field] ? `err-${index}-${field}` : undefined
                    }
                    onChange={(e) =>
                      onChange(
                        parcels.map((row, i) =>
                          i === index
                            ? { ...row, [field]: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                  {errors[field] && (
                    <small className="error" id={`err-${index}-${field}`}>
                      {errors[field]}
                    </small>
                  )}
                </label>
              ))}
              <label>
                Unité des dimensions
                <select
                  value={p.unit}
                  onChange={(e) =>
                    onChange(
                      parcels.map((row, i) =>
                        i === index
                          ? { ...row, unit: e.target.value as "cm" | "m" }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="cm">Centimètres</option>
                  <option value="m">Mètres</option>
                </select>
              </label>
            </div>
            {parcels.length > 1 && (
              <button
                type="button"
                className="text-button"
                onClick={() => onChange(parcels.filter((_, i) => i !== index))}
              >
                Supprimer le colis {index + 1}
              </button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
