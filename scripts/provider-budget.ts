export const trackedProviders = ["geoapify", "maptiler", "exa", "nws", "resend", "stripe"] as const;
export type TrackedProvider = typeof trackedProviders[number];

export type ProviderUsage = Readonly<{
  provider: TrackedProvider;
  meter: string;
  units: number | null;
  actualCostUsd?: number | null;
}>;

export type ProviderRate = Readonly<{
  meter: string;
  unitCostUsd: number;
  softBudgetUsd: number;
  hardBudgetUsd: number;
}>;

export type ProviderBudgetConfig = Readonly<{
  schemaVersion: 1;
  currency: "USD";
  period: "calendar_month";
  providers: Partial<Record<TrackedProvider, ProviderRate>>;
}>;

function nonnegative(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite nonnegative number`);
  return value;
}

export function parseProviderBudgetConfig(value: string | undefined): ProviderBudgetConfig | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (parsed.schemaVersion !== 1 || parsed.currency !== "USD" || parsed.period !== "calendar_month" || !parsed.providers || typeof parsed.providers !== "object" || Array.isArray(parsed.providers)) {
    throw new Error("PROVIDER_BUDGETS_JSON must be a version 1 USD calendar-month configuration");
  }
  const providers: Partial<Record<TrackedProvider, ProviderRate>> = {};
  for (const [provider, raw] of Object.entries(parsed.providers as Record<string, unknown>)) {
    if (!trackedProviders.includes(provider as TrackedProvider)) throw new Error(`Unsupported provider budget: ${provider}`);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${provider} budget must be an object`);
    const input = raw as Record<string, unknown>;
    if (typeof input.meter !== "string" || !input.meter.trim()) throw new Error(`${provider}.meter is required`);
    const rate = {
      meter: input.meter,
      unitCostUsd: nonnegative(input.unitCostUsd, `${provider}.unitCostUsd`),
      softBudgetUsd: nonnegative(input.softBudgetUsd, `${provider}.softBudgetUsd`),
      hardBudgetUsd: nonnegative(input.hardBudgetUsd, `${provider}.hardBudgetUsd`),
    };
    if (rate.softBudgetUsd > rate.hardBudgetUsd) throw new Error(`${provider}.softBudgetUsd must not exceed hardBudgetUsd`);
    providers[provider as TrackedProvider] = rate;
  }
  return { schemaVersion: 1, currency: "USD", period: "calendar_month", providers };
}

export function evaluateProviderBudgets(usage: readonly ProviderUsage[], config: ProviderBudgetConfig | null) {
  const byProvider = new Map(usage.map((item) => [item.provider, item]));
  return trackedProviders.map((provider) => {
    const observed = byProvider.get(provider) ?? { provider, meter: "untracked", units: null };
    const rate = config?.providers[provider];
    if (!rate) return { ...observed, status: "unconfigured" as const, estimatedCostUsd: observed.actualCostUsd ?? null, softBudgetUsd: null, hardBudgetUsd: null };
    if (observed.meter !== rate.meter) return { ...observed, status: "meter_mismatch" as const, estimatedCostUsd: observed.actualCostUsd ?? null, softBudgetUsd: rate.softBudgetUsd, hardBudgetUsd: rate.hardBudgetUsd };
    if (observed.units === null && observed.actualCostUsd == null) return { ...observed, status: "unmeasured" as const, estimatedCostUsd: null, softBudgetUsd: rate.softBudgetUsd, hardBudgetUsd: rate.hardBudgetUsd };
    const estimatedCostUsd = observed.actualCostUsd ?? observed.units! * rate.unitCostUsd;
    const status = estimatedCostUsd >= rate.hardBudgetUsd ? "hard_limit" as const : estimatedCostUsd >= rate.softBudgetUsd ? "soft_limit" as const : "ok" as const;
    return { ...observed, status, estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)), softBudgetUsd: rate.softBudgetUsd, hardBudgetUsd: rate.hardBudgetUsd };
  });
}
