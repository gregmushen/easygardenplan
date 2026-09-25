CREATE TABLE "bed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"active_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bed" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bed_geometry_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"bed_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"geometry" jsonb NOT NULL,
	"geographic_transform" jsonb NOT NULL,
	"measurement_provenance" text NOT NULL,
	"sunlight" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bed" ADD CONSTRAINT "bed_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed" ADD CONSTRAINT "bed_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" ADD CONSTRAINT "bed_geometry_revision_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bed_tenant_key" ON "bed" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" ADD CONSTRAINT "bed_geometry_tenant_bed_fk" FOREIGN KEY ("organization_id","bed_id") REFERENCES "public"."bed"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bed_garden_idx" ON "bed" USING btree ("garden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bed_geometry_revision_uidx" ON "bed_geometry_revision" USING btree ("bed_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "bed_geometry_tenant_key" ON "bed_geometry_revision" USING btree ("organization_id","id");--> statement-breakpoint
CREATE POLICY "bed_tenant" ON "bed" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("bed"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("bed"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "bed_geometry_revision_tenant" ON "bed_geometry_revision" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("bed_geometry_revision"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("bed_geometry_revision"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
ALTER TABLE "bed" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bed" ADD CONSTRAINT "bed_revision_check" CHECK ("revision" >= 0);--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" ADD CONSTRAINT "bed_geometry_revision_check" CHECK ("revision" > 0);--> statement-breakpoint
ALTER TABLE "bed_geometry_revision" ADD CONSTRAINT "bed_measurement_provenance_check" CHECK ("measurement_provenance" IN ('map_drawn', 'measured', 'calibrated'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_bed_geometry_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bed geometry revisions are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER bed_geometry_revision_immutable BEFORE UPDATE ON "bed_geometry_revision" FOR EACH ROW EXECUTE FUNCTION protect_bed_geometry_revision();--> statement-breakpoint
REVOKE ALL ON "bed", "bed_geometry_revision" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "bed", "bed_geometry_revision" TO trestle_app;
