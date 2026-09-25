import { describe, expect, it } from "vitest";
import { evaluateProviderBudgets, parseProviderBudgetConfig } from "./provider-budget.js";

const config = JSON.stringify({ schemaVersion: 1, currency: "USD", period: "calendar_month", providers: {
  geoapify: { meter: "request", unitCostUsd: 0.01, softBudgetUsd: 1, hardBudgetUsd: 2 },
  exa: { meter: "search", unitCostUsd: 0.02, softBudgetUsd: 1, hardBudgetUsd: 5 },
  maptiler: { meter: "map_session", unitCostUsd: 0.001, softBudgetUsd: 1, hardBudgetUsd: 2 },
} });

describe("provider budgets", () => {
  it("reports thresholds, actual billed cost, missing meters and unconfigured providers", () => {
    const result = evaluateProviderBudgets([
      { provider: "geoapify", meter: "request", units: 150 },
      { provider: "exa", meter: "search", units: 2, actualCostUsd: 6 },
      { provider: "maptiler", meter: "map_session", units: null },
    ], parseProviderBudgetConfig(config));
    expect(result.find(({ provider }) => provider === "geoapify")).toMatchObject({ estimatedCostUsd: 1.5, status: "soft_limit" });
    expect(result.find(({ provider }) => provider === "exa")).toMatchObject({ estimatedCostUsd: 6, status: "hard_limit" });
    expect(result.find(({ provider }) => provider === "maptiler")).toMatchObject({ status: "unmeasured" });
    expect(result.find(({ provider }) => provider === "nws")).toMatchObject({ status: "unconfigured" });
  });

  it("rejects unknown providers, negative rates and inverted thresholds", () => {
    expect(() => parseProviderBudgetConfig('{"schemaVersion":1,"currency":"USD","period":"calendar_month","providers":{"other":{}}}')).toThrow("Unsupported provider");
    expect(() => parseProviderBudgetConfig('{"schemaVersion":1,"currency":"USD","period":"calendar_month","providers":{"exa":{"meter":"search","unitCostUsd":-1,"softBudgetUsd":1,"hardBudgetUsd":2}}}')).toThrow("nonnegative");
    expect(() => parseProviderBudgetConfig('{"schemaVersion":1,"currency":"USD","period":"calendar_month","providers":{"exa":{"meter":"search","unitCostUsd":1,"softBudgetUsd":3,"hardBudgetUsd":2}}}')).toThrow("must not exceed");
  });
});
