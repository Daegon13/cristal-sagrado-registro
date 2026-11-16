-- Upgrade for the MVP. Apply AFTER 001_initial.sql. Safe to rerun on an unused/new installation.
-- Never run on other projects (especially Smart Stock).

-- A one-step transaction for creating contact + inquiry. A retry with the same key
-- returns the same inquiry instead of creating another client.
alter table public.inquiries add column if not exists idempotency_key uuid unique;
alter table public.expenses add column if not exists idempotency_key uuid unique;

create or replace function public.register_inquiry(
 p_org_id uuid,p_source text,p_alias text,p_contact_id uuid,p_key uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare found_id uuid; target_contact uuid;
begin
 if (select auth.uid()) is null or not public.is_org_member(p_org_id) then
   raise exception 'Sesión sin autorización' using errcode='42501';
 end if;
 if p_key is null then raise exception 'Falta identificador de operación'; end if;
 -- Serializes simultaneous retries using the same idempotency key.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,0));
 select id into found_id from public.inquiries where idempotency_key=p_key;
 if found_id is not null then
   if not exists(select 1 from public.inquiries where id=found_id and org_id=p_org_id and created_by=(select auth.uid())) then
      raise exception 'Clave utilizada por otro registro';
   end if;
   return found_id;
 end if;
 if p_contact_id is null then
   insert into public.contacts(org_id,alias,source,created_by)
   values(p_org_id,substring(coalesce(nullif(pg_catalog.btrim(p_alias),''), 'Consulta '||pg_catalog.to_char(pg_catalog.now() at time zone 'America/Montevideo','DD/MM HH24:MI')) from 1 for 100),p_source,(select auth.uid()))
   returning id into target_contact;
 else
   if not exists(select 1 from public.contacts where id=p_contact_id and org_id=p_org_id) then
      raise exception 'Cliente inexistente en esta organización';
   end if;
   target_contact := p_contact_id;
 end if;
 insert into public.inquiries(org_id,contact_id,source,created_by,idempotency_key)
 values(p_org_id,target_contact,p_source,(select auth.uid()),p_key)
 returning id into found_id;
 return found_id;
end $$;
revoke all on function public.register_inquiry(uuid,text,text,uuid,uuid) from public;
grant execute on function public.register_inquiry(uuid,text,text,uuid,uuid) to authenticated;

-- Corrections don't erase past transactions. A false entry is VOIDED, with a
-- reason and an audit trail. Do not use 'refund' to correct a typo.
alter table public.payments add column if not exists voided_at timestamptz;
alter table public.payments add column if not exists voided_by uuid references auth.users(id);
alter table public.payments add column if not exists void_reason text;
alter table public.expenses add column if not exists voided_at timestamptz;
alter table public.expenses add column if not exists voided_by uuid references auth.users(id);
alter table public.expenses add column if not exists void_reason text;

create or replace function public.guard_financial_correction() returns trigger language plpgsql set search_path = '' as $$
begin
 if old.voided_at is not null then raise exception 'El asiento ya está anulado'; end if;
 if new.voided_at is null or pg_catalog.char_length(pg_catalog.btrim(coalesce(new.void_reason,''))) < 6 then
    raise exception 'La anulación requiere un motivo de al menos 6 caracteres';
 end if;
 if (pg_catalog.to_jsonb(new)-'voided_at'-'voided_by'-'void_reason') is distinct from
    (pg_catalog.to_jsonb(old)-'voided_at'-'voided_by'-'void_reason') then
    raise exception 'No se pueden modificar importes u otros campos de un asiento';
 end if;
 new.voided_at := pg_catalog.now();
 new.voided_by := (select auth.uid());
 new.void_reason := substring(pg_catalog.btrim(new.void_reason) from 1 for 240);
 return new;
end $$;

drop trigger if exists protect_payment_ledger on public.payments;
create trigger protect_payment_ledger before update on public.payments
for each row execute function public.guard_financial_correction();
drop trigger if exists protect_expense_ledger on public.expenses;
create trigger protect_expense_ledger before update on public.expenses
for each row execute function public.guard_financial_correction();

create policy payments_void on public.payments for update to authenticated
using(public.is_org_member(org_id)) with check(public.is_org_member(org_id));
create policy expenses_void on public.expenses for update to authenticated
using(public.is_org_member(org_id)) with check(public.is_org_member(org_id));

-- Never allow client-side insertion of a manual audit record; a trigger alone writes it.
create index if not exists audit_org_time on public.audit_log(org_id,created_at desc);
create index if not exists inquiries_dedup on public.inquiries(idempotency_key) where idempotency_key is not null;
create index if not exists expenses_dedup on public.expenses(idempotency_key) where idempotency_key is not null;
