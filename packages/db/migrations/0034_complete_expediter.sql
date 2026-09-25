CREATE TABLE "garden" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"latitude" text,
	"longitude" text,
	"timezone" text,
	"units" text,
	"conditions" text,
	"monitoring_enabled" boolean,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garden_tenant_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "garden" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "garden_organization_idx" ON "garden" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "garden_tenant" ON "garden" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("garden"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("garden"."organization_id" = current_setting('app.organization_id', true));
--> statement-breakpoint
ALTER TABLE "garden" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "garden" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "garden" TO trestle_app;
