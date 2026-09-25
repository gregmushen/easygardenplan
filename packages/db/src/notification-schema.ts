import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";
import { garden } from "./garden-schema.js";
import { recommendationTransition, recommendationVersion } from "./monitoring-schema.js";

export const notificationPreference = pgTable("notification_preference", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  urgentEmailEnabled: boolean("urgent_email_enabled").default(true).notNull(),
  resolutionEmailEnabled: boolean("resolution_email_enabled").default(true).notNull(),
  routineEmailEnabled: boolean("routine_email_enabled").default(true).notNull(),
  digestEmailEnabled: boolean("digest_email_enabled").default(true).notNull(),
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  urgentDuringQuietHours: boolean("urgent_during_quiet_hours").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("notification_preference_recipient_uidx").on(table.organizationId, table.userId),
  check("notification_preference_quiet_hours_check", sql`(${table.quietHoursStart} is null and ${table.quietHoursEnd} is null) or (${table.quietHoursStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.quietHoursEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`),
  pgPolicy("notification_preference_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const notificationDigest = pgTable("notification_digest", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gardenId: uuid("garden_id").notNull(),
  recipientUserId: text("recipient_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  localDate: text("local_date").notNull(),
  includedRecommendationVersionIds: jsonb("included_recommendation_version_ids").default([]).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").default("pending").notNull(),
  suppressionReason: text("suppression_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("notification_digest_identity_uidx").on(table.gardenId, table.recipientUserId, table.localDate),
  uniqueIndex("notification_digest_idempotency_uidx").on(table.idempotencyKey),
  uniqueIndex("notification_digest_tenant_key").on(table.organizationId, table.id),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "notification_digest_tenant_garden_fk" }).onDelete("cascade"),
  check("notification_digest_date_check", sql`${table.localDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`),
  check("notification_digest_status_check", sql`${table.status} in ('pending','accepted','delivered','failed','suppressed')`),
  pgPolicy("notification_digest_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const notificationFeedEntry = pgTable("notification_feed_entry", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gardenId: uuid("garden_id").notNull(),
  transitionId: uuid("transition_id").notNull(),
  recommendationVersionId: uuid("recommendation_version_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("notification_feed_transition_uidx").on(table.transitionId),
  uniqueIndex("notification_feed_tenant_key").on(table.organizationId, table.id),
  index("notification_feed_garden_idx").on(table.gardenId, table.createdAt),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "notification_feed_tenant_garden_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.transitionId], foreignColumns: [recommendationTransition.organizationId, recommendationTransition.id], name: "notification_feed_tenant_transition_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.recommendationVersionId], foreignColumns: [recommendationVersion.organizationId, recommendationVersion.id], name: "notification_feed_tenant_version_fk" }).onDelete("restrict"),
  pgPolicy("notification_feed_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();

export const notificationDeliveryIntent = pgTable("notification_delivery_intent", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  gardenId: uuid("garden_id").notNull(),
  transitionId: uuid("transition_id").notNull(),
  recommendationVersionId: uuid("recommendation_version_id").notNull(),
  recipientUserId: text("recipient_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("email"),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  suppressionReason: text("suppression_reason"),
  providerDeliveryId: text("provider_delivery_id"),
  attemptToken: uuid("attempt_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("notification_delivery_semantic_uidx").on(table.transitionId, table.recipientUserId, table.channel),
  uniqueIndex("notification_delivery_idempotency_uidx").on(table.idempotencyKey),
  uniqueIndex("notification_delivery_tenant_key").on(table.organizationId, table.id),
  index("notification_delivery_provider_idx").on(table.providerDeliveryId),
  index("notification_delivery_pending_idx").on(table.status, table.leaseExpiresAt),
  foreignKey({ columns: [table.organizationId, table.gardenId], foreignColumns: [garden.organizationId, garden.id], name: "notification_delivery_tenant_garden_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.transitionId], foreignColumns: [recommendationTransition.organizationId, recommendationTransition.id], name: "notification_delivery_tenant_transition_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.organizationId, table.recommendationVersionId], foreignColumns: [recommendationVersion.organizationId, recommendationVersion.id], name: "notification_delivery_tenant_version_fk" }).onDelete("restrict"),
  check("notification_delivery_channel_check", sql`${table.channel} in ('email')`),
  check("notification_delivery_status_check", sql`${table.status} in ('pending','sending','accepted','delivered','bounced','complained','failed','suppressed')`),
  pgPolicy("notification_delivery_tenant", { for: "all", to: "trestle_app", using: sql`${table.organizationId} = current_setting('app.organization_id', true)`, withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)` }),
]).enableRLS();
