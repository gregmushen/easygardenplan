import { index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const crop = pgTable("crop", {
  id: uuid("id").defaultRandom().primaryKey(), slug: text("slug").notNull(), commonName: text("common_name").notNull(), scientificName: text("scientific_name"), status: text("status").default("draft").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("crop_slug_uidx").on(table.slug)]);

export const cropAlias = pgTable("crop_alias", {
  id: uuid("id").defaultRandom().primaryKey(), cropId: uuid("crop_id").notNull().references(() => crop.id, { onDelete: "cascade" }), alias: text("alias").notNull(), normalizedAlias: text("normalized_alias").notNull(),
}, (table) => [uniqueIndex("crop_alias_normalized_uidx").on(table.normalizedAlias), index("crop_alias_crop_idx").on(table.cropId)]);

export const cropVariety = pgTable("crop_variety", {
  id: uuid("id").defaultRandom().primaryKey(), cropId: uuid("crop_id").notNull().references(() => crop.id, { onDelete: "cascade" }), name: text("name").notNull(), normalizedName: text("normalized_name").notNull(), status: text("status").default("draft").notNull(),
}, (table) => [uniqueIndex("crop_variety_identity_uidx").on(table.cropId, table.normalizedName)]);

export const knowledgeSource = pgTable("knowledge_source", {
  id: uuid("id").defaultRandom().primaryKey(), url: text("url").notNull(), title: text("title").notNull(), publisher: text("publisher").notNull(), sourceType: text("source_type").notNull(), publishedOrUpdatedAt: timestamp("published_or_updated_at", { withTimezone: true }), accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull(), attributionNotes: text("attribution_notes"), contentChecksum: text("content_checksum"),
}, (table) => [uniqueIndex("knowledge_source_url_uidx").on(table.url)]);

export const researchRun = pgTable("research_run", {
  id: uuid("id").defaultRandom().primaryKey(), provider: text("provider").notNull(), providerRunId: text("provider_run_id"), requestFingerprint: text("request_fingerprint").notNull(), brief: jsonb("brief").notNull(), status: text("status").notNull(), attemptCount: integer("attempt_count").default(0).notNull(), result: jsonb("result"), usage: jsonb("usage"), costUsd: numeric("cost_usd", { precision: 12, scale: 6 }), errorCode: text("error_code"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [uniqueIndex("research_run_fingerprint_uidx").on(table.requestFingerprint)]);

export const evidenceItem = pgTable("evidence_item", {
  id: uuid("id").defaultRandom().primaryKey(), sourceId: uuid("source_id").notNull().references(() => knowledgeSource.id, { onDelete: "restrict" }), researchRunId: uuid("research_run_id").references(() => researchRun.id, { onDelete: "set null" }), locator: text("locator"), permittedExcerpt: text("permitted_excerpt"), normalizedClaim: text("normalized_claim").notNull(), scope: jsonb("scope").notNull(), originalUnits: text("original_units"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("evidence_source_idx").on(table.sourceId), index("evidence_run_idx").on(table.researchRunId)]);

export const ruleFamily = pgTable("rule_family", {
  id: uuid("id").defaultRandom().primaryKey(), cropId: uuid("crop_id").notNull().references(() => crop.id, { onDelete: "restrict" }), varietyId: uuid("variety_id").references(() => cropVariety.id, { onDelete: "restrict" }), ruleType: text("rule_type").notNull(), method: text("method").notNull(), contextKey: text("context_key").default("default").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("rule_family_identity_uidx").on(table.cropId, table.varietyId, table.ruleType, table.method, table.contextKey)]);

export const reviewDecision = pgTable("review_decision", {
  id: uuid("id").defaultRandom().primaryKey(), reviewerId: text("reviewer_id").notNull(), decision: text("decision").notNull(), rationale: text("rationale").notNull(), evidenceIds: jsonb("evidence_ids").notNull(), decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ruleVersion = pgTable("rule_version", {
  id: uuid("id").defaultRandom().primaryKey(), familyId: uuid("family_id").notNull().references(() => ruleFamily.id, { onDelete: "restrict" }), version: integer("version").notNull(), schemaVersion: integer("schema_version").default(1).notNull(), state: text("state").default("draft").notNull(), applicability: jsonb("applicability").notNull(), payload: jsonb("payload").notNull(), evidenceIds: jsonb("evidence_ids").notNull(), overridesRuleVersionIds: jsonb("overrides_rule_version_ids").default([]).notNull(), reviewDecisionId: uuid("review_decision_id").references(() => reviewDecision.id, { onDelete: "restrict" }), replacementVersionId: uuid("replacement_version_id"), publishedAt: timestamp("published_at", { withTimezone: true }), withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("rule_version_family_version_uidx").on(table.familyId, table.version), index("rule_version_state_idx").on(table.state)]);

export const catalogRelease = pgTable("catalog_release", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(), status: text("status").default("draft").notNull(), publishedBy: text("published_by"), publishedAt: timestamp("published_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("catalog_release_name_uidx").on(table.name)]);

export const catalogReleaseRule = pgTable("catalog_release_rule", {
  releaseId: uuid("release_id").notNull().references(() => catalogRelease.id, { onDelete: "cascade" }), ruleVersionId: uuid("rule_version_id").notNull().references(() => ruleVersion.id, { onDelete: "restrict" }),
}, (table) => [primaryKey({ columns: [table.releaseId, table.ruleVersionId] })]);
