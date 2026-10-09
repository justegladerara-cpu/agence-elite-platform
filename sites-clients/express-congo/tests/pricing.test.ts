import { test, expect } from "vitest";
import { estimate, PricingRule } from "@/domain/pricing";
// Fictional rules, never exported to public content or stored as active tariffs.
const rule: PricingRule = {
  id: "test-fictional",
  version: 1,
  status: "VALIDÉ",
  validatedBy: "test-only",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  service: "aerien",
  route: "FR-CG",
  category: "test",
  currency: "EUR",
  unit: "kg",
  minimumMinor: "100",
  feeMinor: "20",
  customs: "exclu — test",
  exclusions: "règle fictive",
  round: "up",
  tiers: [
    { from: "0", to: "100", priceMinor: "11" },
    { from: "100", to: null, priceMinor: "10" },
  ],
};
const request = {
  enabled: true,
  service: "aerien",
  route: "FR-CG",
  category: "test",
  quantity: "1",
  at: "2026-10-08",
};
test("absence, ambiguïté, validation manquante et interrupteur fermé donnent un devis manuel", () => {
  for (const r of [
    null,
    { ...rule, status: "OBSERVÉ" as const },
    { ...rule, customs: "" },
  ])
    expect(estimate(r, request).kind).toBe("manual");
  expect(estimate(rule, { ...request, enabled: false }).kind).toBe("manual");
});
test("minimum, frais et centimes sont des entiers exacts", () => {
  expect(estimate(rule, request)).toMatchObject({
    totalMinor: "120",
    transportMinor: "100",
    feeMinor: "20",
  });
  expect(estimate(rule, { ...request, quantity: "99,999" })).toMatchObject({
    transportMinor: "1100",
    totalMinor: "1120",
  });
});
test("bornes décimales exclusives, pas de trou à 99,5", () => {
  expect(estimate(rule, { ...request, quantity: "99,5" })).toMatchObject({
    transportMinor: "1095",
  });
  expect(estimate(rule, { ...request, quantity: "100" })).toMatchObject({
    transportMinor: "1000",
  });
});
test("instantané indépendant des futures modifications", () => {
  const result = estimate(rule, request);
  if (result.kind !== "estimate") throw new Error("échec");
  rule.version = 2;
  expect(result.snapshot.version).toBe(1);
  rule.version = 1;
});
test("paliers contradictoires refusés", () =>
  expect(
    estimate(
      {
        ...rule,
        tiers: [...rule.tiers, { from: "0", to: null, priceMinor: "1" }],
      },
      request,
    ).kind,
  ).toBe("manual"));
