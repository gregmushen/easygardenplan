CREATE TABLE "garden_progress_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"task_id" uuid,
	"selection_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"occurred_local_date" text NOT NULL,
	"bed_id" uuid,
	"position" jsonb,
	"supersedes_event_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_progress_event_type_check" CHECK ("garden_progress_event"."event_type" IN ('sown', 'emerged', 'transplanted', 'harvested', 'removed', 'task_completed', 'task_postponed', 'task_skipped', 'correction'))
);
--> statement-breakpoint
ALTER TABLE "garden_progress_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"selection_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"window_start_local_date" text NOT NULL,
	"window_end_local_date" text NOT NULL,
	"depends_on_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instruction" text NOT NULL,
	"origin" text DEFAULT 'plan' NOT NULL,
	"source_progress_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_task_type_check" CHECK ("plan_task"."task_type" IN ('sow', 'seed_start', 'transplant', 'harvest', 'care')),
	CONSTRAINT "plan_task_window_check" CHECK ("plan_task"."window_start_local_date" <= "plan_task"."window_end_local_date"),
	CONSTRAINT "plan_task_origin_check" CHECK ("plan_task"."origin" IN ('plan', 'derived_actual'))
);
--> statement-breakpoint
ALTER TABLE "plan_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_status_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"state" text NOT NULL,
	"scheduled_start_local_date" text NOT NULL,
	"scheduled_end_local_date" text NOT NULL,
	"actual_local_date" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_status_revision_check" CHECK ("task_status_version"."revision" > 0),
	CONSTRAINT "task_status_state_check" CHECK ("task_status_version"."state" IN ('planned', 'completed', 'postponed', 'skipped')),
	CONSTRAINT "task_status_window_check" CHECK ("task_status_version"."scheduled_start_local_date" <= "task_status_version"."scheduled_end_local_date")
);
--> statement-breakpoint
ALTER TABLE "task_status_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_tenant_key" ON "plan_task" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_tenant_plan_fk" FOREIGN KEY ("organization_id","plan_version_id") REFERENCES "public"."garden_plan_version"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_tenant_task_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."plan_task"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_tenant_bed_fk" FOREIGN KEY ("organization_id","bed_id") REFERENCES "public"."bed"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_tenant_plan_fk" FOREIGN KEY ("organization_id","plan_version_id") REFERENCES "public"."garden_plan_version"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_version" ADD CONSTRAINT "task_status_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_status_version" ADD CONSTRAINT "task_status_tenant_task_fk" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."plan_task"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "garden_progress_tenant_key" ON "garden_progress_event" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "garden_progress_garden_date_idx" ON "garden_progress_event" USING btree ("garden_id","occurred_local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_source_event_uidx" ON "plan_task" USING btree ("source_progress_event_id") WHERE "plan_task"."source_progress_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "plan_task_garden_window_idx" ON "plan_task" USING btree ("garden_id","window_start_local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "task_status_revision_uidx" ON "task_status_version" USING btree ("task_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "task_status_tenant_key" ON "task_status_version" USING btree ("organization_id","id");--> statement-breakpoint
CREATE POLICY "garden_progress_tenant" ON "garden_progress_event" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("garden_progress_event"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("garden_progress_event"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "plan_task_tenant" ON "plan_task" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("plan_task"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("plan_task"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "task_status_tenant" ON "task_status_version" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("task_status_version"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("task_status_version"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "garden_progress_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_task" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_status_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_dates_check" CHECK ("window_start_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "window_end_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "task_status_version" ADD CONSTRAINT "task_status_dates_check" CHECK ("scheduled_start_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "scheduled_end_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND ("actual_local_date" IS NULL OR "actual_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'));--> statement-breakpoint
ALTER TABLE "garden_progress_event" ADD CONSTRAINT "garden_progress_date_check" CHECK ("occurred_local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_append_only_garden_records() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'garden history records are append-only'; END; $$;--> statement-breakpoint
CREATE TRIGGER plan_task_immutable BEFORE UPDATE ON "plan_task" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
CREATE TRIGGER task_status_version_immutable BEFORE UPDATE ON "task_status_version" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
CREATE TRIGGER garden_progress_event_immutable BEFORE UPDATE ON "garden_progress_event" FOR EACH ROW EXECUTE FUNCTION protect_append_only_garden_records();--> statement-breakpoint
REVOKE ALL ON "garden_progress_event", "plan_task", "task_status_version" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "garden_progress_event", "plan_task", "task_status_version" TO trestle_app;
