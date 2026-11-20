-- Apply only to a new, dedicated Neon database/branch. Never run the Supabase SQL here.
BEGIN;
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- Neon Managed Better Auth user IDs are strings; no dependency on neon_auth schema activation.
CREATE TABLE memberships (org_id uuid NOT NULL REFERENCES organizations(id), user_id text NOT NULL, role text NOT NULL CHECK (role IN ('admin','operator')), PRIMARY KEY (org_id,user_id));
CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), alias text NOT NULL CHECK (length(btrim(alias)) BETWEEN 1 AND 100), source text NOT NULL CHECK (source IN ('instagram','instagram_ads','web','referral','returning','other')), source_detail text, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, UNIQUE (org_id,id));
CREATE TABLE inquiries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid, source text NOT NULL CHECK (source IN ('instagram','instagram_ads','web','referral','returning','other')), note text, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, idempotency_key uuid NOT NULL UNIQUE, UNIQUE (org_id,id), FOREIGN KEY (org_id,contact_id) REFERENCES contacts(org_id,id));
CREATE TABLE sales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), contact_id uuid NOT NULL, service text NOT NULL CHECK (length(btrim(service)) BETWEEN 1 AND 120), agreed_amount numeric(12,2) NOT NULL CHECK (agreed_amount > 0), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')), created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, UNIQUE (org_id,id), FOREIGN KEY (org_id,contact_id) REFERENCES contacts(org_id,id));
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), sale_id uuid NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount > 0), method text NOT NULL CHECK (method IN ('prex','itau','cash','other')), kind text NOT NULL CHECK (kind IN ('payment','refund')), received_at timestamptz NOT NULL DEFAULT now(), note text, idempotency_key uuid NOT NULL UNIQUE, created_by text NOT NULL, voided_at timestamptz, voided_by text, void_reason text, UNIQUE (org_id,id), FOREIGN KEY (org_id,sale_id) REFERENCES sales(org_id,id), CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) BETWEEN 6 AND 240)));
CREATE TABLE expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), amount numeric(12,2) NOT NULL CHECK (amount > 0), category text NOT NULL CHECK (category IN ('ads','materials','fees','other')), occurred_on date NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, idempotency_key uuid NOT NULL UNIQUE, voided_at timestamptz, voided_by text, void_reason text, UNIQUE (org_id,id), CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) BETWEEN 6 AND 240)));
CREATE TABLE audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), table_name text NOT NULL, row_id uuid NOT NULL, operation text NOT NULL, actor text, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE report_dispatches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), start_date date NOT NULL, end_date date NOT NULL, recipient text NOT NULL, report_hash text NOT NULL, status text NOT NULL CHECK (status IN ('pending','sent','failed')), provider_id text, error_code text, dispatched_at timestamptz, actor text, created_at timestamptz NOT NULL DEFAULT now(), CHECK (end_date >= start_date), UNIQUE (org_id,start_date,end_date,report_hash));
CREATE INDEX contacts_org_time ON contacts(org_id,created_at DESC,id DESC);
CREATE INDEX inquiries_org_time ON inquiries(org_id,created_at DESC,id DESC);
CREATE INDEX sales_org_time ON sales(org_id,created_at DESC,id DESC);
CREATE INDEX payments_org_time ON payments(org_id,received_at DESC,id DESC);
CREATE INDEX expenses_org_date ON expenses(org_id,occurred_on DESC,id DESC);
CREATE INDEX audit_org_time ON audit_log(org_id,created_at DESC,id DESC);
-- Database role may have bypassrls; all application queries must still use server membership checks.
CREATE FUNCTION ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Ledger deletion forbidden'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Already voided'; END IF;
  IF (to_jsonb(NEW)-'voided_at'-'voided_by'-'void_reason') IS DISTINCT FROM (to_jsonb(OLD)-'voided_at'-'voided_by'-'void_reason') THEN RAISE EXCEPTION 'Ledger fields immutable'; END IF;
  IF NEW.voided_at IS NULL OR NEW.voided_by IS NULL OR length(btrim(coalesce(NEW.void_reason,''))) NOT BETWEEN 6 AND 240 THEN RAISE EXCEPTION 'Void requires actor and reason'; END IF;
  IF TG_TABLE_NAME='payments' THEN
    PERFORM 1 FROM sales WHERE id=NEW.sale_id AND org_id=NEW.org_id FOR UPDATE;
    IF (SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) FROM payments WHERE sale_id=NEW.sale_id AND org_id=NEW.org_id AND voided_at IS NULL AND id<>OLD.id)<0 THEN RAISE EXCEPTION 'Void would leave refunds above received amount'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE balance numeric(12,2); BEGIN
  PERFORM 1 FROM sales WHERE id=NEW.sale_id AND org_id=NEW.org_id AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale unavailable'; END IF;
  IF NEW.kind='refund' THEN
    SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) INTO balance FROM payments WHERE sale_id=NEW.sale_id AND org_id=NEW.org_id AND voided_at IS NULL;
    IF NEW.amount>balance THEN RAISE EXCEPTION 'Refund exceeds received amount'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_refund_guard BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION refund_guard();
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION ledger_guard();
CREATE TRIGGER expenses_guard BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION ledger_guard();
CREATE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO audit_log(org_id,table_name,row_id,operation,actor,before_data,after_data)
  VALUES (COALESCE(NEW.org_id,OLD.org_id),TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),TG_OP,COALESCE(NULLIF(current_setting('app.actor_id',true),''),to_jsonb(NEW)->>'voided_by',to_jsonb(NEW)->>'created_by',to_jsonb(NEW)->>'actor',to_jsonb(OLD)->>'created_by'),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER contacts_audit AFTER INSERT OR UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER inquiries_audit AFTER INSERT OR UPDATE ON inquiries FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER sales_audit AFTER INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER payments_audit AFTER INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER expenses_audit AFTER INSERT OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE TRIGGER dispatches_audit AFTER INSERT OR UPDATE ON report_dispatches FOR EACH ROW EXECUTE FUNCTION audit_change();
CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is immutable'; END $$;
CREATE TRIGGER audit_guard BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION immutable_audit();
COMMIT;
