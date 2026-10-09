/**
 * Lignes d’une proposition commerciale. Les montants sont convertis en
 * unités mineures entières (centimes pour l’euro, francs pour le XAF) :
 * aucun calcul en virgule flottante.
 */
export type ProposalLine = {
  label: string;
  quantity: number;
  unitMinor: string;
  totalMinor: string;
};

const decimals: Record<string, number> = { EUR: 2, XAF: 0 };

/** « 125,5 » → 12550 pour l’euro ; « 15000 » → 15000 pour le XAF. */
export function toMinor(value: unknown, currency: string): bigint | null {
  const places = decimals[currency];
  if (places === undefined) return null;
  const text = String(value ?? "")
    .trim()
    .replace(/\s/g, "");
  const pattern =
    places === 0
      ? /^\d{1,12}$/
      : new RegExp(`^\\d{1,10}([.,]\\d{1,${places}})?$`);
  if (!pattern.test(text)) return null;
  const [whole, fraction = ""] = text.split(/[.,]/);
  return BigInt(whole + fraction.padEnd(places, "0"));
}

/** Valide 1 à 20 lignes et calcule les totaux ; `null` si une ligne est invalide. */
export function proposalLines(
  input: unknown,
  currency: string,
): { lines: ProposalLine[]; totalMinor: string } | null {
  const raw = typeof input === "string" ? safeParse(input) : input;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) return null;
  let total = 0n;
  const lines: ProposalLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { label, quantity, unit } = item as Record<string, unknown>;
    const name = typeof label === "string" ? label.trim() : "";
    const qty = toThousandths(quantity);
    const unitMinor = toMinor(unit, currency);
    if (
      !name ||
      name.length > 160 ||
      qty === null ||
      unitMinor === null ||
      unitMinor <= 0n
    )
      return null;
    // Quantité en millièmes (kilos décimaux) ; arrondi au plus proche.
    const lineTotal = (unitMinor * qty + 500n) / 1000n;
    total += lineTotal;
    lines.push({
      label: name,
      quantity: Number(qty) / 1000,
      unitMinor: unitMinor.toString(),
      totalMinor: lineTotal.toString(),
    });
  }
  if (total > 999_999_999_999n) return null;
  return { lines, totalMinor: total.toString() };
}

/** « 23,5 » → 23500 millièmes ; de 0,001 à 99 999,999. */
export function toThousandths(value: unknown): bigint | null {
  const text = String(value ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!/^\d{1,5}([.,]\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(/[.,]/);
  const n = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return n > 0n ? n : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
