import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, integer, jsonb, numeric, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema.js";
import { garden } from "./garden-schema.js";

export const climateDatasetVersion = pgTable("climate_dataset_version", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  sourceName: text("source_name").notNull(),
  sourceRelease: text("source_release").notNull(),
  sourceUrl: text("source_url").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  normalizationVersion: integer("normalization_version").notNull(),
  attribution: text("attribution").notNull(),
  coverage: jsonb("coverage").notNull(),
  status: text("status").default("staging").notNull(),
  recordCount: integer("record_count").default(0).notNull(),
  rejectedCount: integer("rejected_count").default(0).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("climate_dataset_release_uidx").on(table.kind, table.sourceRelease, table.checksumSha256), index("climate_dataset_current_idx").on(table.kind, table.status, table.publishedAt)]);

export const climateRecord = pgTable("climate_record", {
  id: uuid("id").defaultRandom().primaryKey(),
  datasetVersionId: uuid("dataset_version_id").notNull().references(() => climateDatasetVersion.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  elevationMeters: numeric("elevation_meters", { precision: 9, scale: 2 }),
  hardinessZone: text("hardiness_zone"),
  frostState: text("frost_state").notNull(),
  springFrostLocalDate: text("spring_frost_local_date"),
  autumnFrostLocalDate: text("autumn_frost_local_date"),
  referencePeriod: text("reference_period"),
  probabilityPercent: numeric("probability_percent", { precision: 5, scale: 2 }),
}, (table) => [uniqueIndex("climate_record_external_uidx").on(table.datasetVersionId, table.externalId), index("climate_record_dataset_idx").on(table.datasetVersionId), index("climate_record_coordinate_idx").on(table.datasetVersionId, table.latitude, table.longitude)]);

export const climateAssociation = pgTable("climate_association", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gardenId: uuid("garden_id").notNull(),
  version: integer("version").notNull(),
  active: boolean("active").default(true).notNull(),
  datasetVersionId: uuid("dataset_version_id").references(() => climateDatasetVersion.id, { onDelete: "restrict" }),
  recordId: uuid("record_id").references(() => climateRecord.id, { onDelete: "restrict" }),
  state: text("state").notNull(),
  hardinessZone: text("hardiness_zone"),
  springFrostLocalDate: text("spring_frost_local_date"),
  autumnFrostLocalDate: text("autumn_frost_local_date"),
  distanceMeters: numeric("distance_meters", { precision: 12, scale: 2 }),
  elevationDifferenceMeters: numeric("elevation_difference_meters", { precision: 10, scale: 2 }),
  confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
  rationale: text("rationale").notNull(),
  source: text("source").notNull(),
  sourceEvidence: jsonb("source_evidence").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("climate_association_version_uidx").on(table.gardenId, table.version),
  index("climate_association_active_idx").on(table.gardenId, table.active),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "climate_association_tenant_garden_fk" }).onDelete("cascade"),
  pgPolicy("climate_association_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const locationProviderUsage = pgTable("location_provider_usage", {
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").default(0).notNull(),
}, (table) => [
  uniqueIndex("location_provider_usage_window_uidx").on(table.organizationId, table.provider, table.windowStartedAt),
  pgPolicy("location_provider_usage_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();
