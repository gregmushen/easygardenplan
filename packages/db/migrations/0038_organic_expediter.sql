CREATE TABLE "catalog_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_release_rule" (
	"release_id" uuid NOT NULL,
	"rule_version_id" uuid NOT NULL,
	CONSTRAINT "catalog_release_rule_release_id_rule_version_id_pk" PRIMARY KEY("release_id","rule_version_id")
);
--> statement-breakpoint
CREATE TABLE "crop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"common_name" text NOT NULL,
	"scientific_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crop_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crop_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crop_variety" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"research_run_id" uuid,
	"locator" text,
	"permitted_excerpt" text,
	"normalized_claim" text NOT NULL,
	"scope" jsonb NOT NULL,
	"original_units" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"source_type" text NOT NULL,
	"published_or_updated_at" timestamp with time zone,
	"accessed_at" timestamp with time zone NOT NULL,
	"attribution_notes" text,
	"content_checksum" text
);
--> statement-breakpoint
CREATE TABLE "research_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_run_id" text,
	"request_fingerprint" text NOT NULL,
	"brief" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"usage" jsonb,
	"cost_usd" numeric(12, 6),
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_id" text NOT NULL,
	"decision" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crop_id" uuid NOT NULL,
	"variety_id" uuid,
	"rule_type" text NOT NULL,
	"method" text NOT NULL,
	"context_key" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"applicability" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"review_decision_id" uuid,
	"replacement_version_id" uuid,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_release_rule" ADD CONSTRAINT "catalog_release_rule_release_id_catalog_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."catalog_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_release_rule" ADD CONSTRAINT "catalog_release_rule_rule_version_id_rule_version_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."rule_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_alias" ADD CONSTRAINT "crop_alias_crop_id_crop_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_variety" ADD CONSTRAINT "crop_variety_crop_id_crop_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crop"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_source_id_knowledge_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_item" ADD CONSTRAINT "evidence_item_research_run_id_research_run_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_family" ADD CONSTRAINT "rule_family_crop_id_crop_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crop"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_family" ADD CONSTRAINT "rule_family_variety_id_crop_variety_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_variety"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_family_id_rule_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."rule_family"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_review_decision_id_review_decision_id_fk" FOREIGN KEY ("review_decision_id") REFERENCES "public"."review_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_release_name_uidx" ON "catalog_release" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_slug_uidx" ON "crop" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_alias_normalized_uidx" ON "crop_alias" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "crop_alias_crop_idx" ON "crop_alias" USING btree ("crop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_variety_identity_uidx" ON "crop_variety" USING btree ("crop_id","normalized_name");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "evidence_item" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "evidence_run_idx" ON "evidence_item" USING btree ("research_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_url_uidx" ON "knowledge_source" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "research_run_fingerprint_uidx" ON "research_run" USING btree ("request_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_family_identity_uidx" ON "rule_family" USING btree ("crop_id","variety_id","rule_type","method","context_key");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_version_family_version_uidx" ON "rule_version" USING btree ("family_id","version");--> statement-breakpoint
CREATE INDEX "rule_version_state_idx" ON "rule_version" USING btree ("state");
--> statement-breakpoint
DROP INDEX "rule_family_identity_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX "rule_family_identity_uidx" ON "rule_family" ("crop_id", "variety_id", "rule_type", "method", "context_key") NULLS NOT DISTINCT;
--> statement-breakpoint
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_replacement_fk" FOREIGN KEY ("replacement_version_id") REFERENCES "rule_version"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "crop" ADD CONSTRAINT "crop_status_check" CHECK ("status" IN ('draft', 'published', 'retired'));
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_state_check" CHECK ("state" IN ('draft', 'reviewed', 'rejected', 'conflicted', 'published', 'withdrawn'));
ALTER TABLE "catalog_release" ADD CONSTRAINT "catalog_release_status_check" CHECK ("status" IN ('draft', 'published', 'withdrawn'));
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_value_check" CHECK ("decision" IN ('accepted', 'rejected', 'conflicted'));
--> statement-breakpoint
CREATE FUNCTION protect_published_rule_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('published', 'withdrawn') AND (
    NEW.family_id IS DISTINCT FROM OLD.family_id OR NEW.version IS DISTINCT FROM OLD.version OR
    NEW.schema_version IS DISTINCT FROM OLD.schema_version OR NEW.applicability IS DISTINCT FROM OLD.applicability OR
    NEW.payload IS DISTINCT FROM OLD.payload OR NEW.evidence_ids IS DISTINCT FROM OLD.evidence_ids OR
    NEW.review_decision_id IS DISTINCT FROM OLD.review_decision_id OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) THEN RAISE EXCEPTION 'published rule versions are immutable'; END IF;
  IF OLD.state = 'withdrawn' AND NEW.state IS DISTINCT FROM OLD.state THEN RAISE EXCEPTION 'withdrawn rule versions are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rule_version_immutable BEFORE UPDATE ON "rule_version" FOR EACH ROW EXECUTE FUNCTION protect_published_rule_version();
--> statement-breakpoint
REVOKE ALL ON "crop", "crop_alias", "crop_variety", "knowledge_source", "research_run", "evidence_item", "rule_family", "review_decision", "rule_version", "catalog_release", "catalog_release_rule" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "crop", "crop_alias", "crop_variety", "knowledge_source", "research_run", "evidence_item", "rule_family", "review_decision", "rule_version", "catalog_release", "catalog_release_rule" TO trestle_app;
