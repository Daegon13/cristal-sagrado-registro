-- Apply after 003 on the isolated Preview branch. Back up and rehearse before Production.
BEGIN;
ALTER TABLE contacts ADD COLUMN display_name text;
ALTER TABLE contacts ADD COLUMN instagram_handle text;
ALTER TABLE contacts ADD COLUMN handle_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN merged_into uuid;
ALTER TABLE contacts ADD CONSTRAINT contacts_merge_same_org FOREIGN KEY (org_id,merged_into) REFERENCES contacts(org_id,id);
ALTER TABLE contacts ADD CONSTRAINT contacts_display_name_length CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 100);
ALTER TABLE contacts ADD CONSTRAINT contacts_handle_format CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$');
ALTER TABLE contacts ADD CONSTRAINT contacts_confirmed_handle CHECK (NOT handle_confirmed OR instagram_handle IS NOT NULL);
CREATE UNIQUE INDEX contacts_confirmed_handle_org ON contacts(org_id,instagram_handle) WHERE handle_confirmed AND instagram_handle IS NOT NULL;
CREATE INDEX contacts_handle_lookup ON contacts(org_id,instagram_handle);

ALTER TABLE sales ADD COLUMN inquiry_id uuid;
ALTER TABLE sales ADD COLUMN idempotency_key uuid UNIQUE;
ALTER TABLE sales ADD CONSTRAINT sales_inquiry_same_org FOREIGN KEY (org_id,inquiry_id) REFERENCES inquiries(org_id,id);
CREATE INDEX sales_inquiry_lookup ON sales(org_id,inquiry_id);

CREATE TABLE ad_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 starts_on date NOT NULL, ends_on date NOT NULL, budget_kind text NOT NULL CHECK (budget_kind IN ('daily','total')),
 budget_amount numeric(12,2) NOT NULL CHECK (budget_amount > 0),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
 UNIQUE (org_id,id), CHECK (ends_on >= starts_on)
);
CREATE INDEX ad_campaigns_org_dates ON ad_campaigns(org_id,starts_on,ends_on);
CREATE TABLE ad_spend_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
 campaign_id uuid, starts_on date NOT NULL, ends_on date NOT NULL,
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 source text NOT NULL DEFAULT 'meta_ads_manager' CHECK (source='meta_ads_manager'),
 note text, idempotency_key uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
 voided_at timestamptz, voided_by text, void_reason text,
 UNIQUE (org_id,id), FOREIGN KEY (org_id,campaign_id) REFERENCES ad_campaigns(org_id,id),
 CHECK (ends_on >= starts_on),
 CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
        (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) BETWEEN 6 AND 240))
);
CREATE INDEX ad_spend_org_period ON ad_spend_entries(org_id,starts_on,ends_on) WHERE voided_at IS NULL;
CREATE INDEX ad_spend_campaign_period ON ad_spend_entries(org_id,campaign_id,starts_on,ends_on) WHERE voided_at IS NULL;
CREATE FUNCTION ad_spend_overlap_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id::text||'/ads/'||coalesce(NEW.campaign_id::text,'none'),0));
 IF EXISTS (SELECT 1 FROM ad_spend_entries WHERE org_id=NEW.org_id AND campaign_id IS NOT DISTINCT FROM NEW.campaign_id
            AND voided_at IS NULL AND starts_on<=NEW.ends_on AND ends_on>=NEW.starts_on) THEN
   RAISE EXCEPTION 'Advertising spend period overlaps';
 END IF;
 IF NEW.campaign_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ad_campaigns WHERE org_id=NEW.org_id AND id=NEW.campaign_id AND starts_on<=NEW.starts_on AND ends_on>=NEW.ends_on) THEN
   RAISE EXCEPTION 'Advertising spend outside campaign';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ad_spend_overlap BEFORE INSERT ON ad_spend_entries FOR EACH ROW EXECUTE FUNCTION ad_spend_overlap_guard();
CREATE TRIGGER ad_spend_guard BEFORE UPDATE OR DELETE ON ad_spend_entries FOR EACH ROW EXECUTE FUNCTION ledger_guard();
CREATE TRIGGER ad_campaigns_audit AFTER INSERT OR UPDATE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER ad_spend_audit AFTER INSERT OR UPDATE ON ad_spend_entries FOR EACH ROW EXECUTE FUNCTION audit_change();
COMMIT;
