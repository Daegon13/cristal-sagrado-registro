-- Run in a new, dedicated Supabase project. Do NOT run in the public website database.
create extension if not exists pgcrypto;
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.memberships (org_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), role text not null check(role in ('admin','operator')), primary key(org_id,user_id));
create or replace function public.is_org_member(target_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.memberships where org_id=target_org and user_id=(select auth.uid())) $$;
revoke all on function public.is_org_member(uuid) from public; grant execute on function public.is_org_member(uuid) to authenticated;

create table public.contacts (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), alias text not null,
 source text not null check(source in('instagram','instagram_ads','web','referral','returning','other')),
 source_detail text, created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 constraint contact_alias_len check(char_length(alias) between 1 and 100)
);
create table public.inquiries (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 contact_id uuid references public.contacts(id), source text not null check(source in('instagram','instagram_ads','web','referral','returning','other')),
 note text, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table public.sales (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 contact_id uuid not null references public.contacts(id), service text not null,
 agreed_amount numeric(12,2) not null check(agreed_amount>=0),
 status text not null default 'open' check(status in('open','completed','cancelled')),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 sale_id uuid not null references public.sales(id), amount numeric(12,2) not null check(amount>0),
 method text not null check(method in('prex','itau','cash','other')),
 kind text not null check(kind in('payment','refund')),
 received_at timestamptz not null default now(), note text,
 idempotency_key uuid not null unique, created_by uuid references auth.users(id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 amount numeric(12,2) not null check(amount>0), category text not null check(category in('ads','materials','fees','other')),
 occurred_on date not null, note text, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table public.audit_log (
 id bigint generated always as identity primary key, org_id uuid not null, table_name text not null,
 row_id uuid not null, operation text not null, actor uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table public.report_dispatches (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 start_date date not null,end_date date not null, recipient text not null, report_hash text not null,
 dispatched_at timestamptz not null default now(), actor uuid references auth.users(id),
 constraint valid_period check(end_date>=start_date)
);

-- Prevent cross-organization references even if the caller knows a UUID from another organization.
create or replace function public.check_relations_org() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='inquiries' and new.contact_id is not null and not exists(select 1 from public.contacts where id=new.contact_id and org_id=new.org_id) then raise exception 'Contacto fuera de la organización'; end if;
 if tg_table_name='sales' and not exists(select 1 from public.contacts where id=new.contact_id and org_id=new.org_id) then raise exception 'Contacto fuera de la organización'; end if;
 if tg_table_name='payments' and not exists(select 1 from public.sales where id=new.sale_id and org_id=new.org_id) then raise exception 'Venta fuera de la organización'; end if;
 return new;
end $$;
create trigger inquiry_org before insert or update on public.inquiries for each row execute function public.check_relations_org();
create trigger sale_org before insert or update on public.sales for each row execute function public.check_relations_org();
create trigger payment_org before insert or update on public.payments for each row execute function public.check_relations_org();

-- Journal every modification in source tables. Reports are derived, not authority.
create or replace function public.log_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(org_id,table_name,row_id,operation,actor,before_data,after_data)
 values(coalesce(new.org_id,old.org_id),tg_table_name,coalesce(new.id,old.id),tg_op,(select auth.uid()),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger log_contacts after insert or update or delete on public.contacts for each row execute function public.log_change();
create trigger log_inquiries after insert or update or delete on public.inquiries for each row execute function public.log_change();
create trigger log_sales after insert or update or delete on public.sales for each row execute function public.log_change();
create trigger log_payments after insert or update or delete on public.payments for each row execute function public.log_change();
create trigger log_expenses after insert or update or delete on public.expenses for each row execute function public.log_change();

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.inquiries enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_log enable row level security;
alter table public.report_dispatches enable row level security;
create policy org_read on public.organizations for select to authenticated using(public.is_org_member(id));
create policy membership_read on public.memberships for select to authenticated using(user_id=(select auth.uid()));
-- Membership management is admin-only via Supabase SQL/service, never exposed via browser.
create policy contacts_read on public.contacts for select to authenticated using(public.is_org_member(org_id));
create policy contacts_insert on public.contacts for insert to authenticated with check(public.is_org_member(org_id) and created_by=(select auth.uid()));
create policy contacts_update on public.contacts for update to authenticated using(public.is_org_member(org_id)) with check(public.is_org_member(org_id));
create policy inquiries_read on public.inquiries for select to authenticated using(public.is_org_member(org_id));
create policy inquiries_insert on public.inquiries for insert to authenticated with check(public.is_org_member(org_id) and created_by=(select auth.uid()));
create policy sales_read on public.sales for select to authenticated using(public.is_org_member(org_id));
create policy sales_insert on public.sales for insert to authenticated with check(public.is_org_member(org_id) and created_by=(select auth.uid()));
create policy sales_update on public.sales for update to authenticated using(public.is_org_member(org_id)) with check(public.is_org_member(org_id));
create policy payments_read on public.payments for select to authenticated using(public.is_org_member(org_id));
create policy payments_insert on public.payments for insert to authenticated with check(public.is_org_member(org_id) and created_by=(select auth.uid()));
create policy expenses_read on public.expenses for select to authenticated using(public.is_org_member(org_id));
create policy expenses_insert on public.expenses for insert to authenticated with check(public.is_org_member(org_id) and created_by=(select auth.uid()));
create policy audit_read on public.audit_log for select to authenticated using(public.is_org_member(org_id));
create policy dispatch_read on public.report_dispatches for select to authenticated using(public.is_org_member(org_id));
create index inquiries_org_time on public.inquiries(org_id,created_at desc);
create index contacts_org_time on public.contacts(org_id,created_at desc);
create index payments_org_time on public.payments(org_id,received_at desc);
create index sales_org_time on public.sales(org_id,created_at desc);
create index expenses_org_date on public.expenses(org_id,occurred_on desc);

-- After inviting both users through Supabase Authentication, copy their UUIDs from Auth > Users.
-- Replace placeholders and run once in SQL Editor:
-- insert into public.organizations(name) values ('Cristal Sagrado') returning id;
-- insert into public.memberships(org_id,user_id,role) values
-- ('<ORG_UUID>','<LUCIA_AUTH_USER_UUID>','admin'),
-- ('<ORG_UUID>','<DIEGO_AUTH_USER_UUID>','admin');
