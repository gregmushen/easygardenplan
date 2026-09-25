CREATE TABLE "notification_digest_due" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"local_date" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_digest_due_date_check" CHECK ("notification_digest_due"."local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "notification_digest_due" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_digest" DROP CONSTRAINT "notification_digest_status_check";--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "provider_delivery_id" text;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "attempt_token" uuid;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_digest_due" ADD CONSTRAINT "notification_digest_due_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_due" ADD CONSTRAINT "notification_digest_due_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_due" ADD CONSTRAINT "notification_digest_due_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_due_identity_uidx" ON "notification_digest_due" USING btree ("garden_id","recipient_user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_due_tenant_key" ON "notification_digest_due" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "notification_digest_due_at_idx" ON "notification_digest_due" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "notification_digest_pending_idx" ON "notification_digest" USING btree ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "notification_digest" ADD CONSTRAINT "notification_digest_status_check" CHECK ("notification_digest"."status" in ('pending','sending','accepted','delivered','bounced','complained','failed','suppressed'));--> statement-breakpoint
CREATE POLICY "notification_digest_due_tenant" ON "notification_digest_due" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("notification_digest_due"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("notification_digest_due"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "notification_digest_due_platform" ON "notification_digest_due" AS PERMISSIVE FOR ALL TO "trestle_platform" USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE "notification_digest_due" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "notification_digest_due" FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_digest_due" TO trestle_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_digest_due" TO trestle_platform;--> statement-breakpoint
-- Tenant notification code can resolve only the household owner for its current tenant.
-- This avoids granting the application role a cross-tenant read over the auth user table.
CREATE OR REPLACE FUNCTION easygardenplan_household_recipient(p_organization_id text)
RETURNS TABLE(user_id text, email text, email_verified boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF nullif(current_setting('app.organization_id', true), '') IS NOT NULL
     AND current_setting('app.organization_id', true) <> p_organization_id THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, u.email_verified
    FROM public.organization o
    JOIN public."user" u ON u.id = o.household_owner_user_id
    WHERE o.id = p_organization_id;
END
$function$;--> statement-breakpoint
REVOKE ALL ON FUNCTION easygardenplan_household_recipient(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION easygardenplan_household_recipient(text) TO trestle_app;
