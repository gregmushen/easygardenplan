CREATE TABLE "climate_association" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"dataset_version_id" uuid,
	"record_id" uuid,
	"state" text NOT NULL,
	"hardiness_zone" text,
	"spring_frost_local_date" text,
	"autumn_frost_local_date" text,
	"distance_meters" numeric(12, 2),
	"elevation_difference_meters" numeric(10, 2),
	"confidence" numeric(5, 4) NOT NULL,
	"rationale" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "climate_association" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "climate_dataset_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_name" text NOT NULL,
	"source_release" text NOT NULL,
	"source_url" text NOT NULL,
	"checksum_sha256" text NOT NULL,
	"normalization_version" integer NOT NULL,
	"attribution" text NOT NULL,
	"coverage" jsonb NOT NULL,
	"status" text DEFAULT 'staging' NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "climate_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"elevation_meters" numeric(9, 2),
	"hardiness_zone" text,
	"frost_state" text NOT NULL,
	"spring_frost_local_date" text,
	"autumn_frost_local_date" text,
	"reference_period" text,
	"probability_percent" numeric(5, 2)
);
--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_garden_id_garden_id_fk" FOREIGN KEY ("garden_id") REFERENCES "public"."garden"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_dataset_version_id_climate_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."climate_dataset_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_record_id_climate_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."climate_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_record" ADD CONSTRAINT "climate_record_dataset_version_id_climate_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."climate_dataset_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "climate_association_version_uidx" ON "climate_association" USING btree ("garden_id","version");--> statement-breakpoint
CREATE INDEX "climate_association_active_idx" ON "climate_association" USING btree ("garden_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "climate_dataset_release_uidx" ON "climate_dataset_version" USING btree ("kind","source_release","checksum_sha256");--> statement-breakpoint
CREATE INDEX "climate_dataset_current_idx" ON "climate_dataset_version" USING btree ("kind","status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "climate_record_external_uidx" ON "climate_record" USING btree ("dataset_version_id","external_id");--> statement-breakpoint
CREATE INDEX "climate_record_dataset_idx" ON "climate_record" USING btree ("dataset_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "climate_association_one_active_uidx" ON "climate_association" ("garden_id") WHERE "active" = true;--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_state_check" CHECK ("state" IN ('known', 'frost_free', 'unknown', 'uncertain'));--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_source_check" CHECK ("source" IN ('dataset_match', 'user_anchor', 'unavailable'));--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);--> statement-breakpoint
ALTER TABLE "climate_dataset_version" ADD CONSTRAINT "climate_dataset_status_check" CHECK ("status" IN ('staging', 'published', 'rejected'));--> statement-breakpoint
ALTER TABLE "climate_record" ADD CONSTRAINT "climate_record_state_check" CHECK ("frost_state" IN ('known', 'frost_free', 'unknown', 'uncertain'));--> statement-breakpoint
ALTER TABLE "climate_record" ADD CONSTRAINT "climate_record_coordinate_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);--> statement-breakpoint
CREATE POLICY "climate_association_tenant" ON "climate_association" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("climate_association"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("climate_association"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "climate_association" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "climate_dataset_version", "climate_record", "climate_association" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "climate_association" TO trestle_app;--> statement-breakpoint
GRANT SELECT ON "climate_dataset_version", "climate_record" TO trestle_app;
