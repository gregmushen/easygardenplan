ALTER TABLE "garden" ADD COLUMN "location_confirmed" boolean;
--> statement-breakpoint
ALTER TABLE "garden" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "garden" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "garden" TO trestle_app;
