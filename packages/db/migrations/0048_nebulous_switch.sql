CREATE TABLE "weather_official_alert_garden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"alert_snapshot_id" uuid NOT NULL,
	"matched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weather_official_alert_garden" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weather_official_alert_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_alert_id" text NOT NULL,
	"event" text NOT NULL,
	"status" text NOT NULL,
	"message_type" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"onset_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"headline" text,
	"source_url" text NOT NULL,
	"area_description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weather_official_alert_garden" ADD CONSTRAINT "weather_official_alert_garden_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_official_alert_garden" ADD CONSTRAINT "weather_official_alert_garden_alert_snapshot_id_weather_official_alert_snapshot_id_fk" FOREIGN KEY ("alert_snapshot_id") REFERENCES "public"."weather_official_alert_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_official_alert_garden" ADD CONSTRAINT "weather_official_alert_garden_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weather_official_alert_garden_uidx" ON "weather_official_alert_garden" USING btree ("garden_id","alert_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_official_alert_garden_tenant_key" ON "weather_official_alert_garden" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_official_alert_identity_uidx" ON "weather_official_alert_snapshot" USING btree ("provider","provider_alert_id","sent_at");--> statement-breakpoint
CREATE INDEX "weather_official_alert_expiry_idx" ON "weather_official_alert_snapshot" USING btree ("provider","expires_at");--> statement-breakpoint
CREATE POLICY "weather_official_alert_garden_tenant" ON "weather_official_alert_garden" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("weather_official_alert_garden"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("weather_official_alert_garden"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
GRANT SELECT, INSERT ON "weather_official_alert_snapshot" TO trestle_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "weather_official_alert_garden" TO trestle_app;
