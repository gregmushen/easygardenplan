CREATE TABLE "crop_selection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"variety_id" uuid,
	"method" text NOT NULL,
	"quantity" integer NOT NULL,
	"preferred_bed_id" uuid,
	"bed_restriction" text DEFAULT 'soft' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crop_selection_method_check" CHECK ("crop_selection"."method" IN ('direct_sow', 'indoor_start', 'purchased_start')),
	CONSTRAINT "crop_selection_quantity_check" CHECK ("crop_selection"."quantity" > 0),
	CONSTRAINT "crop_selection_bed_restriction_check" CHECK ("crop_selection"."bed_restriction" IN ('soft', 'only')),
	CONSTRAINT "crop_selection_revision_check" CHECK ("crop_selection"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "crop_selection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "garden_plan_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'proposal' NOT NULL,
	"algorithm_version" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"acknowledged_limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_plan_version_check" CHECK ("garden_plan_version"."version" > 0),
	CONSTRAINT "garden_plan_state_check" CHECK ("garden_plan_version"."state" IN ('proposal', 'active', 'superseded', 'stale', 'errored')),
	CONSTRAINT "garden_plan_algorithm_check" CHECK ("garden_plan_version"."algorithm_version" = 'grid-v1')
);
--> statement-breakpoint
ALTER TABLE "garden_plan_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crop_selection" ADD CONSTRAINT "crop_selection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_selection" ADD CONSTRAINT "crop_selection_crop_id_crop_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crop"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_selection" ADD CONSTRAINT "crop_selection_variety_id_crop_variety_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_variety"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_selection" ADD CONSTRAINT "crop_selection_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_selection" ADD CONSTRAINT "crop_selection_tenant_bed_fk" FOREIGN KEY ("organization_id","preferred_bed_id") REFERENCES "public"."bed"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_plan_version" ADD CONSTRAINT "garden_plan_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_plan_version" ADD CONSTRAINT "garden_plan_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crop_selection_garden_idx" ON "crop_selection" USING btree ("garden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_selection_tenant_key" ON "crop_selection" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "garden_plan_version_uidx" ON "garden_plan_version" USING btree ("garden_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "garden_plan_active_uidx" ON "garden_plan_version" USING btree ("garden_id") WHERE "garden_plan_version"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "garden_plan_tenant_key" ON "garden_plan_version" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "garden_plan_state_idx" ON "garden_plan_version" USING btree ("garden_id","state");--> statement-breakpoint
CREATE POLICY "crop_selection_tenant" ON "crop_selection" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("crop_selection"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("crop_selection"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "garden_plan_tenant" ON "garden_plan_version" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("garden_plan_version"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("garden_plan_version"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "crop_selection" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "garden_plan_version" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "garden_plan_version" ADD CONSTRAINT "garden_plan_fingerprint_check" CHECK ("input_fingerprint" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_garden_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.garden_id IS DISTINCT FROM OLD.garden_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.algorithm_version IS DISTINCT FROM OLD.algorithm_version
    OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
    OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
    OR NEW.result IS DISTINCT FROM OLD.result
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'garden plan inputs and results are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER garden_plan_version_immutable BEFORE UPDATE ON "garden_plan_version" FOR EACH ROW EXECUTE FUNCTION protect_garden_plan_version();--> statement-breakpoint
REVOKE ALL ON "crop_selection", "garden_plan_version" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "crop_selection", "garden_plan_version" TO trestle_app;
