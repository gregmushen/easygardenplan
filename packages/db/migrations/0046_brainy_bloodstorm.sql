CREATE TABLE "notification_delivery_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"transition_id" uuid NOT NULL,
	"recommendation_version_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"suppression_reason" text,
	"provider_delivery_id" text,
	"attempt_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_delivery_channel_check" CHECK ("notification_delivery_intent"."channel" in ('email')),
	CONSTRAINT "notification_delivery_status_check" CHECK ("notification_delivery_intent"."status" in ('pending','sending','accepted','delivered','bounced','complained','failed','suppressed'))
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_feed_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"garden_id" uuid NOT NULL,
	"transition_id" uuid NOT NULL,
	"recommendation_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_feed_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"urgent_email_enabled" boolean DEFAULT true NOT NULL,
	"resolution_email_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"urgent_during_quiet_hours" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_quiet_hours_check" CHECK (("notification_preference"."quiet_hours_start" is null and "notification_preference"."quiet_hours_end" is null) or ("notification_preference"."quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "notification_preference"."quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
ALTER TABLE "notification_preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ADD CONSTRAINT "notification_delivery_intent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ADD CONSTRAINT "notification_delivery_intent_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ADD CONSTRAINT "notification_delivery_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ADD CONSTRAINT "notification_delivery_tenant_transition_fk" FOREIGN KEY ("organization_id","transition_id") REFERENCES "public"."recommendation_transition"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" ADD CONSTRAINT "notification_delivery_tenant_version_fk" FOREIGN KEY ("organization_id","recommendation_version_id") REFERENCES "public"."recommendation_version"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_feed_entry" ADD CONSTRAINT "notification_feed_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_feed_entry" ADD CONSTRAINT "notification_feed_tenant_garden_fk" FOREIGN KEY ("organization_id","garden_id") REFERENCES "public"."garden"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_feed_entry" ADD CONSTRAINT "notification_feed_tenant_transition_fk" FOREIGN KEY ("organization_id","transition_id") REFERENCES "public"."recommendation_transition"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_feed_entry" ADD CONSTRAINT "notification_feed_tenant_version_fk" FOREIGN KEY ("organization_id","recommendation_version_id") REFERENCES "public"."recommendation_version"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_semantic_uidx" ON "notification_delivery_intent" USING btree ("transition_id","recipient_user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_idempotency_uidx" ON "notification_delivery_intent" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_tenant_key" ON "notification_delivery_intent" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "notification_delivery_provider_idx" ON "notification_delivery_intent" USING btree ("provider_delivery_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_pending_idx" ON "notification_delivery_intent" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_feed_transition_uidx" ON "notification_feed_entry" USING btree ("transition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_feed_tenant_key" ON "notification_feed_entry" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "notification_feed_garden_idx" ON "notification_feed_entry" USING btree ("garden_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preference_recipient_uidx" ON "notification_preference" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE POLICY "notification_delivery_tenant" ON "notification_delivery_intent" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("notification_delivery_intent"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("notification_delivery_intent"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "notification_feed_tenant" ON "notification_feed_entry" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("notification_feed_entry"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("notification_feed_entry"."organization_id" = current_setting('app.organization_id', true));--> statement-breakpoint
CREATE POLICY "notification_preference_tenant" ON "notification_preference" AS PERMISSIVE FOR ALL TO "trestle_app" USING ("notification_preference"."organization_id" = current_setting('app.organization_id', true)) WITH CHECK ("notification_preference"."organization_id" = current_setting('app.organization_id', true));
--> statement-breakpoint
ALTER TABLE "notification_delivery_intent" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_feed_entry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_preference" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "notification_delivery_intent", "notification_feed_entry", "notification_preference" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "notification_delivery_intent", "notification_feed_entry", "notification_preference" TO trestle_app;
