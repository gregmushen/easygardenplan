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
