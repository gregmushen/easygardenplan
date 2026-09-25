import { sql } from "drizzle-orm";
import { boolean, index, integer, pgPolicy, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { organization } from "./auth-schema.js";


export const garden = pgTable("garden", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  timezone: text("timezone"),
  locationSource: text("location_source", { enum: ["geocoded", "manual_pin"] }),
  locationProviderPlaceId: text("location_provider_place_id"),
  formattedAddress: text("formatted_address"),
  units: text("units"),
  conditions: text("conditions"),
  monitoringEnabled: boolean("monitoring_enabled"),
  revision: integer("revision").default(1).notNull(),
  locationConfirmed: boolean("location_confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("garden_organization_idx").on(table.organizationId),
  unique("garden_organization_uidx").on(table.organizationId),
  unique("garden_tenant_key").on(table.organizationId, table.id),
  pgPolicy("garden_tenant", {
    for: "all",
    to: "trestle_app",
    using: sql`${table.organizationId} = current_setting('app.organization_id', true)`,
    withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)`,
  }),
]).enableRLS();
