export interface TenantTransaction {
  readonly organizationId: string;
}

export type WithTenant = <Result>(
  organizationId: string,
  operation: (transaction: TenantTransaction) => Promise<Result>,
) => Promise<Result>;
export * from "./resources/garden-repository.js";
export * from "./knowledge-repository.js";
export * from "./research-runs.js";
export * from "./climate-repository.js";
export * from "./location-repository.js";
export * from "./fixtures/representative-climate.js";
export * from "./bed-repository.js";
export * from "./planning-repository.js";
export * from "./progress-repository.js";
