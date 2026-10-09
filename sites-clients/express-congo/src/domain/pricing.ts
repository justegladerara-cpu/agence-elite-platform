import { decimal } from "./measurements";
export type PricingRule = {
  id: string;
  version: number;
  status: "VALIDÉ" | "OBSERVÉ" | "PROPOSÉ" | "À_CONFIRMER";
  validatedBy: string | null;
  validFrom: string;
  validTo: string;
  service: string;
  route: string;
  category: string;
  currency: "EUR" | "XAF";
  unit: "kg" | "m3" | "unite";
  minimumMinor: string;
  feeMinor: string;
  customs: string;
  exclusions: string;
  round: "up" | "nearest";
  tiers: { from: string; to: string | null; priceMinor: string }[];
};
export type Estimate =
  | { kind: "manual"; message: "Devis nécessaire" }
  | {
      kind: "estimate";
      transportMinor: string;
      feeMinor: string;
      totalMinor: string;
      currency: "EUR" | "XAF";
      snapshot: PricingRule;
      notice: string;
    };
export function estimate(
  rule: PricingRule | null,
  request: {
    enabled: boolean;
    service: string;
    route: string;
    category: string;
    quantity: string;
    at: string;
  },
): Estimate {
  const manual: Estimate = { kind: "manual", message: "Devis nécessaire" };
  if (
    !request.enabled ||
    !rule ||
    rule.status !== "VALIDÉ" ||
    !rule.validatedBy ||
    rule.service !== request.service ||
    rule.route !== request.route ||
    rule.category !== request.category ||
    !rule.customs ||
    !rule.exclusions ||
    !rule.validFrom ||
    !rule.validTo ||
    request.at < rule.validFrom ||
    request.at > rule.validTo
  )
    return manual;
  if (
    !/^\d+$/.test(rule.minimumMinor) ||
    !/^\d+$/.test(rule.feeMinor) ||
    !["up", "nearest"].includes(rule.round)
  )
    return manual;
  try {
    const amount = decimal(request.quantity);
    const match = rule.tiers.filter((t) => {
      const from = t.from === "0" ? { n: 0n, d: 1n } : decimal(t.from);
      const to = t.to ? decimal(t.to) : null;
      return (
        amount.n * from.d >= from.n * amount.d &&
        (!to || amount.n * to.d < to.n * amount.d)
      );
    });
    if (
      match.length !== 1 ||
      !/^\d+$/.test(match[0].priceMinor) ||
      BigInt(match[0].priceMinor) <= 0n
    )
      return manual;
    const raw = amount.n * BigInt(match[0].priceMinor),
      rounded =
        rule.round === "up"
          ? (raw + amount.d - 1n) / amount.d
          : (raw * 2n + amount.d) / (2n * amount.d);
    const transport =
      rounded > BigInt(rule.minimumMinor) ? rounded : BigInt(rule.minimumMinor);
    return {
      kind: "estimate",
      transportMinor: transport.toString(),
      feeMinor: rule.feeMinor,
      totalMinor: (transport + BigInt(rule.feeMinor)).toString(),
      currency: rule.currency,
      snapshot: structuredClone(rule),
      notice: "Estimation sans engagement de transport.",
    };
  } catch {
    return manual;
  }
}
