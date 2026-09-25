CREATE TABLE "garden_risk_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"hazard" text NOT NULL,
	"group_key" text NOT NULL,
	"state" text NOT NULL,
	"episode_id" uuid,
	"action_fingerprint" text,
	"clear_confirmation_count" integer DEFAULT 0 NOT NULL,
	"supporting_snapshot_id" uuid,
	"last_evaluated_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "garden_risk_state_check" CHECK ("garden_risk_state"."state" IN ('unknown', 'clear', 'active', 'resolved')),
	CONSTRAINT "garden_risk_revision_check" CHECK ("garden_risk_state"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "garden_risk_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recommendation_episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"hazard" text NOT NULL,
	"group_key" text NOT NULL,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "recommendation_episode_status_check" CHECK ("recommendation_episode"."status" IN ('open', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "recommendation_episode" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recommendation_transition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"recommendation_version_id" uuid NOT NULL,
	"semantic_key" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_transition" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recommendation_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"transition_kind" text NOT NULL,
	"action" text,
	"affected_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_through" timestamp with time zone,
	"evaluation_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recommendation_version_transition_check" CHECK ("recommendation_version"."transition_kind" IN ('warning', 'material_change', 'resolution', 'renewed_warning'))
);
--> statement-breakpoint
ALTER TABLE "recommendation_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weather_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"hazard" text NOT NULL,
	"group_key" text NOT NULL,
	"status" text NOT NULL,
	"snapshot_id" uuid,
	"trace" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "weather_evaluation_status_check" CHECK ("weather_evaluation"."status" IN ('evaluated', 'insufficient_inputs', 'stale', 'unavailable'))
);
--> statement-breakpoint
ALTER TABLE "weather_evaluation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weather_forecast_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"source_key" text NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_through" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"normalization_version" integer NOT NULL,
	"intervals" jsonb NOT NULL,
	CONSTRAINT "weather_forecast_window_check" CHECK ("weather_forecast_snapshot"."valid_from" < "weather_forecast_snapshot"."valid_through")
);
--> statement-breakpoint
CREATE TABLE "weather_location_due" (
	"garden_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"location_revision" integer NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_location_due_revision_check" CHECK ("weather_location_due"."location_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "weather_location_due" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "garden_risk_tenant_key" ON "garden_risk_state" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_episode_tenant_key" ON "recommendation_episode" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_version_tenant_key" ON "recommendation_version" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_evaluation_tenant_key" ON "weather_evaluation" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "garden_risk_state" ADD CONSTRAINT "garden_risk_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_risk_state" ADD CONSTRAINT "garden_risk_state_episode_id_recommendation_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."recommendation_episode"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_risk_state" ADD CONSTRAINT "garden_risk_state_supporting_snapshot_id_weather_forecast_snapshot_id_fk" FOREIGN KEY ("supporting_snapshot_id") REFERENCES "public"."weather_forecast_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_risk_state" ADD CONSTRAINT "garden_risk_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_episode" ADD CONSTRAINT "recommendation_episode_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_episode" ADD CONSTRAINT "recommendation_episode_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_transition" ADD CONSTRAINT "recommendation_transition_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_transition" ADD CONSTRAINT "recommendation_transition_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_transition" ADD CONSTRAINT "recommendation_transition_tenant_episode_fk" FOREIGN KEY ("organization_id","episode_id") REFERENCES "public"."recommendation_episode"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_transition" ADD CONSTRAINT "recommendation_transition_tenant_version_fk" FOREIGN KEY ("organization_id","recommendation_version_id") REFERENCES "public"."recommendation_version"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_version" ADD CONSTRAINT "recommendation_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_version" ADD CONSTRAINT "recommendation_version_tenant_evaluation_fk" FOREIGN KEY ("organization_id","evaluation_id") REFERENCES "public"."weather_evaluation"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_version" ADD CONSTRAINT "recommendation_version_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_version" ADD CONSTRAINT "recommendation_version_tenant_episode_fk" FOREIGN KEY ("organization_id","episode_id") REFERENCES "public"."recommendation_episode"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_evaluation" ADD CONSTRAINT "weather_evaluation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_evaluation" ADD CONSTRAINT "weather_evaluation_snapshot_id_weather_forecast_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."weather_forecast_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_evaluation" ADD CONSTRAINT "weather_evaluation_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_location_due" ADD CONSTRAINT "weather_location_due_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_location_due" ADD CONSTRAINT "weather_location_due_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "garden_risk_identity_uidx" ON "garden_risk_state" USING btree ("garden_id","hazard","group_key");--> statement-breakpoint
CREATE INDEX "recommendation_episode_garden_idx" ON "recommendation_episode" USING btree ("garden_id","hazard","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_transition_semantic_uidx" ON "recommendation_transition" USING btree ("semantic_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_transition_tenant_key" ON "recommendation_transition" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_version_uidx" ON "recommendation_version" USING btree ("episode_id","version");--> statement-breakpoint
CREATE INDEX "weather_evaluation_garden_idx" ON "weather_evaluation" USING btree ("garden_id","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_forecast_identity_uidx" ON "weather_forecast_snapshot" USING btree ("provider","source_key","fingerprint");--> statement-breakpoint
CREATE INDEX "weather_forecast_source_idx" ON "weather_forecast_snapshot" USING btree ("provider","source_key","retrieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_location_due_tenant_key" ON "weather_location_due" USING btree ("organization_id","garden_id");--> statement-breakpoint
CREATE INDEX "weather_location_due_next_idx" ON "weather_location_due" USING btree ("next_due_at");--> statement-breakpoint
CREATE POLICY "garden_risk_tenant" ON "garden_risk_state" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("garden_risk_state"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("garden_risk_state"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "recommendation_episode_tenant" ON "recommendation_episode" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("recommendation_episode"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("recommendation_episode"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "recommendation_transition_tenant" ON "recommendation_transition" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("recommendation_transition"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("recommendation_transition"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "recommendation_version_tenant" ON "recommendation_version" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("recommendation_version"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("recommendation_version"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "weather_evaluation_tenant" ON "weather_evaluation" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("weather_evaluation"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("weather_evaluation"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "weather_location_due_tenant" ON "weather_location_due" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("weather_location_due"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("weather_location_due"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "weather_location_due_platform" ON "weather_location_due" AS PERMISSIVE FOR ALL TO "trestle_platform" USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE "garden_risk_state" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_episode" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_transition" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_evaluation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_location_due" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TRIGGER weather_evaluation_immutable BEFORE UPDATE ON "weather_evaluation" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
CREATE TRIGGER weather_forecast_snapshot_immutable BEFORE UPDATE ON "weather_forecast_snapshot" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
CREATE TRIGGER recommendation_version_immutable BEFORE UPDATE ON "recommendation_version" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
CREATE TRIGGER recommendation_transition_immutable BEFORE UPDATE ON "recommendation_transition" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
REVOKE ALL ON "garden_risk_state", "recommendation_episode", "recommendation_transition", "recommendation_version", "weather_evaluation", "weather_forecast_snapshot", "weather_location_due" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "garden_risk_state", "recommendation_episode", "weather_location_due" TO trestle_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "recommendation_transition", "recommendation_version", "weather_evaluation" TO trestle_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "weather_forecast_snapshot" TO trestle_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "weather_location_due" TO trestle_platform;
