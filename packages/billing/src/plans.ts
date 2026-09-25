export const featureDefinitions = {
  "garden.planning": { description: "Private garden planning, calendar and progress", privileges: ["use"] },
  "weather.monitoring": { description: "Current weather recommendations and frost alerts", privileges: ["run"] },
} as const;

export type FeatureCode = keyof typeof featureDefinitions;
export type FeaturePrivilege<Code extends FeatureCode> = (typeof featureDefinitions)[Code]["privileges"][number];
export type PlanLifecycle = "draft" | "active" | "grandfathered" | "retired";
export type PlanDefinition = Readonly<{ version: number; lifecycle: PlanLifecycle; entitlements: readonly FeatureCode[] }>;

export const plans = {
  free: { version: 1, lifecycle: "active", entitlements: ["garden.planning"] },
  pro: { version: 1, lifecycle: "active", entitlements: ["garden.planning", "weather.monitoring"] },
} as const satisfies Record<string, PlanDefinition>;

export type PlanName = keyof typeof plans;
export type Entitlement = FeatureCode;
export const planEntitlements: Record<PlanName, readonly Entitlement[]> = { free: plans.free.entitlements, pro: plans.pro.entitlements };
export const billablePlans = ["pro"] as const satisfies readonly PlanName[];
export function getPlan(name: string): PlanDefinition | undefined { return plans[name as PlanName]; }
