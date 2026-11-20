-- Apply after 004. Existing dispatches remain intact, including both QA deliveries.
BEGIN;

ALTER TABLE report_dispatches ADD COLUMN report_type text NOT NULL DEFAULT 'financial' CHECK (report_type='financial');
ALTER TABLE report_dispatches ADD COLUMN revision integer;
ALTER TABLE report_dispatches ADD COLUMN dispatch_kind text NOT NULL DEFAULT 'legacy' CHECK (dispatch_kind IN ('legacy','initial','reissue'));
ALTER TABLE report_dispatches ADD COLUMN trigger_source text NOT NULL DEFAULT 'legacy' CHECK (trigger_source IN ('legacy','manual','cron'));
ALTER TABLE report_dispatches ADD COLUMN reissue_reason text;
ALTER TABLE report_dispatches ADD COLUMN supersedes_id uuid;
ALTER TABLE report_dispatches ADD COLUMN request_key uuid UNIQUE;
ALTER TABLE report_dispatches ADD COLUMN report_snapshot jsonb;

WITH ranked AS (
 SELECT id,row_number() OVER (PARTITION BY org_id,start_date,end_date,report_type ORDER BY created_at,id)::integer AS n
 FROM report_dispatches
)
UPDATE report_dispatches d SET revision=ranked.n FROM ranked WHERE d.id=ranked.id;

ALTER TABLE report_dispatches ALTER COLUMN revision SET NOT NULL;
ALTER TABLE report_dispatches ADD CONSTRAINT report_revision_positive CHECK (revision>0);
ALTER TABLE report_dispatches ADD CONSTRAINT report_reissue_metadata CHECK (
 (dispatch_kind='reissue' AND supersedes_id IS NOT NULL AND reissue_reason IS NOT NULL AND length(btrim(reissue_reason)) BETWEEN 10 AND 240 AND trigger_source='manual' AND request_key IS NOT NULL)
 OR (dispatch_kind='initial' AND revision=1 AND supersedes_id IS NULL AND reissue_reason IS NULL AND trigger_source IN ('manual','cron'))
 OR (dispatch_kind='legacy' AND supersedes_id IS NULL AND reissue_reason IS NULL AND trigger_source='legacy')
);
ALTER TABLE report_dispatches ADD CONSTRAINT report_new_snapshot CHECK (dispatch_kind='legacy' OR report_snapshot IS NOT NULL);
CREATE UNIQUE INDEX report_dispatch_org_id ON report_dispatches(org_id,id);
ALTER TABLE report_dispatches ADD CONSTRAINT report_supersedes_same_org FOREIGN KEY (org_id,supersedes_id) REFERENCES report_dispatches(org_id,id);
CREATE UNIQUE INDEX report_revision_unique ON report_dispatches(org_id,start_date,end_date,report_type,revision);

CREATE TABLE report_period_claims (
 org_id uuid NOT NULL REFERENCES organizations(id),
 start_date date NOT NULL, end_date date NOT NULL,
 report_type text NOT NULL CHECK (report_type='financial'),
 claimed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (org_id,start_date,end_date,report_type),
 CHECK (end_date>=start_date)
);
INSERT INTO report_period_claims(org_id,start_date,end_date,report_type)
 SELECT DISTINCT org_id,start_date,end_date,report_type FROM report_dispatches;

CREATE FUNCTION report_dispatch_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Report dispatch deletion forbidden'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'pending' THEN RAISE EXCEPTION 'New report must be pending'; END IF;
   IF NEW.dispatch_kind='legacy' THEN RAISE EXCEPTION 'Legacy report writer is disabled'; END IF;
   IF NOT EXISTS (SELECT 1 FROM report_period_claims WHERE org_id=NEW.org_id AND start_date=NEW.start_date AND end_date=NEW.end_date AND report_type=NEW.report_type) THEN
    RAISE EXCEPTION 'Report period must be claimed first';
   END IF;
   IF NEW.dispatch_kind='initial' AND EXISTS (
    SELECT 1 FROM report_dispatches WHERE org_id=NEW.org_id AND start_date=NEW.start_date AND end_date=NEW.end_date AND report_type=NEW.report_type
   ) THEN RAISE EXCEPTION 'Report period already has an initial dispatch'; END IF;
   IF NEW.dispatch_kind='reissue' AND NOT EXISTS (
    SELECT 1 FROM report_dispatches WHERE org_id=NEW.org_id AND id=NEW.supersedes_id
     AND start_date=NEW.start_date AND end_date=NEW.end_date AND report_type=NEW.report_type
     AND revision=NEW.revision-1 AND status IN ('sent','failed')
   ) THEN RAISE EXCEPTION 'Reissue must replace the latest reconciled revision of the same period'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.status<>'pending' THEN RAISE EXCEPTION 'Completed report is immutable'; END IF;
 IF NEW.status NOT IN ('sent','failed') OR
    (to_jsonb(NEW)-'status'-'provider_id'-'error_code'-'dispatched_at') IS DISTINCT FROM
    (to_jsonb(OLD)-'status'-'provider_id'-'error_code'-'dispatched_at') THEN
   RAISE EXCEPTION 'Report metadata is immutable';
 END IF;
 IF NEW.status='sent' AND (NEW.provider_id IS NULL OR NEW.dispatched_at IS NULL OR NEW.error_code IS NOT NULL) THEN
   RAISE EXCEPTION 'Sent report requires provider id and time';
 END IF;
 IF NEW.status='failed' AND (NEW.error_code IS NULL OR NEW.provider_id IS NOT NULL OR NEW.dispatched_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Failed report requires an error code';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_dispatch_immutable BEFORE INSERT OR UPDATE OR DELETE ON report_dispatches FOR EACH ROW EXECUTE FUNCTION report_dispatch_guard();
CREATE FUNCTION report_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Report period claim is immutable';
END $$;
CREATE TRIGGER report_claim_immutable BEFORE UPDATE OR DELETE ON report_period_claims FOR EACH ROW EXECUTE FUNCTION report_claim_guard();

COMMIT;
