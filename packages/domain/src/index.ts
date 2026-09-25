export type DomainId<Resource extends string> = string & {
  readonly __resource: Resource;
};
export * from "./regional/index.js";
export * from "./resources/garden.js";
export * from "./geometry.js";
export * from "./planner.js";
export * from "./monitoring.js";
