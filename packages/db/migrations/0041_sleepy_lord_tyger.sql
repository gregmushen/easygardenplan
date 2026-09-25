CREATE TABLE "location_provider_usage" (
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_provider_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "climate_association" DROP CONSTRAINT "climate_association_garden_id_garden_id_fk";
--> statement-breakpoint
ALTER TABLE "garden" ADD COLUMN "location_source" text;--> statement-breakpoint
ALTER TABLE "garden" ADD COLUMN "location_provider_place_id" text;--> statement-breakpoint
ALTER TABLE "garden" ADD COLUMN "formatted_address" text;--> statement-breakpoint
ALTER TABLE "location_provider_usage" ADD CONSTRAINT "location_provider_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_provider_usage_window_uidx" ON "location_provider_usage" USING btree ("organization_id","provider","window_started_at");--> statement-breakpoint
ALTER TABLE "climate_association" ADD CONSTRAINT "climate_association_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "location_provider_usage_tenant" ON "location_provider_usage" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("location_provider_usage"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("location_provider_usage"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "location_provider_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "garden" ADD CONSTRAINT "garden_location_source_check" CHECK ("location_source" IS NULL OR "location_source" IN ('geocoded', 'manual_pin'));--> statement-breakpoint
REVOKE ALL ON "location_provider_usage" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "location_provider_usage" TO trestle_app;
