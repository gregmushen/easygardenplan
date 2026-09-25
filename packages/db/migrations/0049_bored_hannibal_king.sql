CREATE TABLE "notification_digest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"local_date" text NOT NULL,
	"included_recommendation_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"suppression_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_digest_date_check" CHECK ("notification_digest"."local_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "notification_digest_status_check" CHECK ("notification_digest"."status" in ('pending','accepted','delivered','failed','suppressed'))
);
--> statement-breakpoint
ALTER TABLE "notification_digest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "routine_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "digest_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD CONSTRAINT "notification_digest_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD CONSTRAINT "notification_digest_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest" ADD CONSTRAINT "notification_digest_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_identity_uidx" ON "notification_digest" USING btree ("garden_id","recipient_user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_idempotency_uidx" ON "notification_digest" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_digest_tenant_key" ON "notification_digest" USING btree ("organization_id","id");--> statement-breakpoint
CREATE POLICY "notification_digest_tenant" ON "notification_digest" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("notification_digest"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("notification_digest"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_digest" TO trestle_app;
