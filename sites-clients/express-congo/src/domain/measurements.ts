export type ParcelInput = {
  length: string;
  width: string;
  height: string;
  weight: string;
  quantity: string;
  unit: "cm" | "m";
};
export type FieldErrors = Record<string, string>;
export const emptyParcel = (): ParcelInput => ({
  length: "",
  width: "",
  height: "",
  weight: "",
  quantity: "1",
  unit: "cm",
});
// Decimal arithmetic with integer fractions: no intermediate commercial rounding.
export function decimal(value: string): { n: bigint; d: bigint } {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(normalized) || normalized.length > 16)
    throw new Error("Saisissez un nombre positif (6 décimales maximum).");
  const parts = normalized.split(".");
  const n = BigInt(parts.join(""));
  const d = 10n ** BigInt(parts[1]?.length || 0);
  if (n <= 0n) throw new Error("La valeur doit être supérieure à zéro.");
  return { n, d };
}
export function fractionString(n: bigint, d: bigint): string {
  const whole = n / d;
  let rest = n % d;
  let digits = "";
  for (let i = 0; rest && i < 30; i++) {
    rest *= 10n;
    digits += (rest / d).toString();
    rest %= d;
  }
  return whole.toString() + (digits ? "." + digits : "");
}
export function validateParcel(parcel: ParcelInput): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of ["length", "width", "height", "weight"] as const) {
    try {
      const value = decimal(parcel[field]);
      if (value.n > 1000000n * value.d) errors[field] = "Valeur trop élevée.";
    } catch (e) {
      errors[field] = (e as Error).message;
    }
  }
  if (
    !/^\d+$/.test(parcel.quantity) ||
    Number(parcel.quantity) < 1 ||
    Number(parcel.quantity) > 10000
  )
    errors.quantity = "Quantité entière entre 1 et 10 000.";
  if (!["cm", "m"].includes(parcel.unit)) errors.unit = "Choisissez cm ou m.";
  return errors;
}
export function volume(parcels: ParcelInput[]): string {
  if (!parcels.length || parcels.length > 50)
    throw new Error("Entre 1 et 50 lignes de colis.");
  let n = 0n,
    d = 1n;
  for (const p of parcels) {
    if (Object.keys(validateParcel(p)).length)
      throw new Error("Mesures invalides");
    const l = decimal(p.length),
      w = decimal(p.width),
      h = decimal(p.height);
    const pn = l.n * w.n * h.n * BigInt(p.quantity),
      pd = l.d * w.d * h.d * (p.unit === "cm" ? 1000000n : 1n);
    n = n * pd + pn * d;
    d *= pd;
  }
  return fractionString(n, d);
}
