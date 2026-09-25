ALTER TABLE "rule_version" ADD COLUMN "overrides_rule_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_published_rule_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('published', 'withdrawn') AND (
    NEW.family_id IS DISTINCT FROM OLD.family_id OR NEW.version IS DISTINCT FROM OLD.version OR
    NEW.schema_version IS DISTINCT FROM OLD.schema_version OR NEW.applicability IS DISTINCT FROM OLD.applicability OR
    NEW.payload IS DISTINCT FROM OLD.payload OR NEW.evidence_ids IS DISTINCT FROM OLD.evidence_ids OR
    NEW.overrides_rule_version_ids IS DISTINCT FROM OLD.overrides_rule_version_ids OR
    NEW.review_decision_id IS DISTINCT FROM OLD.review_decision_id OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) THEN RAISE EXCEPTION 'published rule versions are immutable'; END IF;
  IF OLD.state = 'withdrawn' AND NEW.state IS DISTINCT FROM OLD.state THEN RAISE EXCEPTION 'withdrawn rule versions are immutable'; END IF;
  RETURN NEW;
END $$;
