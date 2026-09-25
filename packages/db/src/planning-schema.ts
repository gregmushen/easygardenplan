import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema.js";
import { bed } from "./bed-schema.js";
import { crop, cropVariety } from "./knowledge-schema.js";
import { garden } from "./garden-schema.js";

export const cropSelection = pgTable("crop_selection", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }), gardenId: uuid("garden_id").notNull(), cropId: uuid("crop_id").notNull().references(() => crop.id, { onDelete: "restrict" }), varietyId: uuid("variety_id").references(() => cropVariety.id, { onDelete: "restrict" }), method: text("method").notNull(), quantity: integer("quantity").notNull(), preferredBedId: uuid("preferred_bed_id"), bedRestriction: text("bed_restriction").default("soft").notNull(), priority: integer("priority").default(0).notNull(), revision: integer("revision").default(1).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("crop_selection_garden_idx").on(table.gardenId),
  uniqueIndex("crop_selection_tenant_key").on(table.organizationId, table.id),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "crop_selection_tenant_garden_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.preferredBedId], foreignColumns: [bed.organizationId, bed.id], name: "crop_selection_tenant_bed_fk" }).onDelete("restrict"),
  check("crop_selection_method_check", sql`${table.method} IN ('direct_sow', 'indoor_start', 'purchased_start')`),
  check("crop_selection_quantity_check", sql`${table.quantity} > 0`),
  check("crop_selection_bed_restriction_check", sql`${table.bedRestriction} IN ('soft', 'only')`),
  check("crop_selection_revision_check", sql`${table.revision} > 0`),
  pgPolicy("crop_selection_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const gardenPlanVersion = pgTable("garden_plan_version", {
  id: uuid("id").defaultRandom().primaryKey(), organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }), gardenId: uuid("garden_id").notNull(), version: integer("version").notNull(), state: text("state").default("proposal").notNull(), algorithmVersion: text("algorithm_version").notNull(), inputFingerprint: text("input_fingerprint").notNull(), inputSnapshot: jsonb("input_snapshot").notNull(), result: jsonb("result").notNull(), acknowledgedLimitations: jsonb("acknowledged_limitations").default([]).notNull(), activatedAt: timestamp("activated_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("garden_plan_version_uidx").on(table.gardenId, table.version),
  uniqueIndex("garden_plan_active_uidx").on(table.gardenId).where(sql`${table.state} = 'active'`),
  uniqueIndex("garden_plan_tenant_key").on(table.organizationId, table.id),
  index("garden_plan_state_idx").on(table.gardenId, table.state),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "garden_plan_tenant_garden_fk" }).onDelete("cascade"),
  check("garden_plan_version_check", sql`${table.version} > 0`),
  check("garden_plan_state_check", sql`${table.state} IN ('proposal', 'active', 'superseded', 'stale', 'errored')`),
  check("garden_plan_algorithm_check", sql`${table.algorithmVersion} = 'grid-v1'`),
  pgPolicy("garden_plan_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();
