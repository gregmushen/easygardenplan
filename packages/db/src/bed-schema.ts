import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth-schema.js";
import { garden } from "./garden-schema.js";

export const bed = pgTable("bed", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gardenId: uuid("garden_id").notNull(),
  name: text("name").notNull(),
  revision: integer("revision").default(0).notNull(),
  activeRevisionId: uuid("active_revision_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("bed_tenant_key").on(table.organizationId, table.id),
  index("bed_garden_idx").on(table.gardenId),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "bed_tenant_garden_fk" }).onDelete("cascade"),
  pgPolicy("bed_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const bedGeometryRevision = pgTable("bed_geometry_revision", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  bedId: uuid("bed_id").notNull(),
  revision: integer("revision").notNull(),
  geometry: jsonb("geometry").notNull(),
  geographicTransform: jsonb("geographic_transform").notNull(),
  measurementProvenance: text("measurement_provenance").notNull(),
  sunlight: jsonb("sunlight").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("bed_geometry_revision_uidx").on(table.bedId, table.revision),
  uniqueIndex("bed_geometry_tenant_key").on(table.organizationId, table.id),
  foreignKey({ columns: [table.organizationId, table.bedId], foreignColumns: [bed.organizationId, bed.id], name: "bed_geometry_tenant_bed_fk" }).onDelete("cascade"),
  pgPolicy("bed_geometry_revision_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();
