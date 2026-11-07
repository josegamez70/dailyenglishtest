-- Stripe billing. Safe to run more than once.
-- Service role writes plan, subscription, and academy seat changes.
-- Signed-in users cannot change those columns. Existing manual academy and tester rows stay put.
-- Student rows, test results, and saved lessons are not deleted when a subscription ends.

alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists billing_provider text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_plan_key text;
alter table public.profiles add column if not exists academy_seat_limit integer;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean not null default false;
alter table public.profiles add column if not exists billing_event_created bigint not null default 0;
alter table public.profiles add column if not exists billing_hold text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_billing_provider_chk') then
    alter table public.profiles
      add constraint profiles_billing_provider_chk
      check (billing_provider is null or billing_provider in ('manual', 'stripe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_academy_seat_limit_chk') then
    alter table public.profiles
      add constraint profiles_academy_seat_limit_chk
      check (academy_seat_limit is null or academy_seat_limit in (20, 40, 70, 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_billing_hold_chk') then
    alter table public.profiles
      add constraint profiles_billing_hold_chk
      check (billing_hold is null or billing_hold in ('dispute', 'fraud_warning', 'refund'));
  end if;
end $$;

create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_uidx
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.billing_events (
  event_id text primary key,
  event_type text not null,
  created_unix bigint not null,
  processed_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from public, anon, authenticated;

create or replace function public.protect_profile_limits()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    new.id := old.id;
    new.email := old.email;
    new.plan := old.plan;
    new.lessons_used := old.lessons_used;
    new.created_at := old.created_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.billing_provider := old.billing_provider;
    new.subscription_status := old.subscription_status;
    new.subscription_plan_key := old.subscription_plan_key;
    new.academy_seat_limit := old.academy_seat_limit;
    new.current_period_end := old.current_period_end;
    new.cancel_at_period_end := old.cancel_at_period_end;
    new.billing_event_created := old.billing_event_created;
    new.billing_hold := old.billing_hold;
  end if;
  return new;
end;
$$;

-- Manual academies keep the historic default of 8 seats.
-- A Stripe academy uses academy_seat_limit (20, 40, 70, or 100).
create or replace function public.create_academy(academy_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_plan text;
  seat_cap integer := 8;
  clean_name text := btrim(coalesce(academy_name, ''));
  new_code text;
  attempt integer;
begin
  if uid is null then
    return 'auth_required';
  end if;
  if clean_name = '' or char_length(clean_name) > 60 then
    return 'name_required';
  end if;
  select p.plan, p.academy_seat_limit into owner_plan, seat_cap
  from public.profiles p
  where p.id = uid;
  if owner_plan is distinct from 'academy' then
    return 'not_academy_plan';
  end if;
  if seat_cap is null or seat_cap not in (20, 40, 70, 100) then
    seat_cap := 8;
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_exists';
  end if;
  for attempt in 1..8 loop
    new_code := public.make_invite_code();
    begin
      insert into public.academies (owner_id, name, invite_code, max_students)
      values (uid, clean_name, new_code, seat_cap);
      return 'ok';
    exception when unique_violation then
      if exists (select 1 from public.academies where owner_id = uid) then
        return 'already_exists';
      end if;
    end;
  end loop;
  return 'code_unavailable';
end;
$$;

create or replace function public.join_academy(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := upper(btrim(coalesce(code, '')));
  academy public.academies%rowtype;
  member_count integer;
  owner_plan text;
begin
  if uid is null then
    return 'auth_required';
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_member';
  end if;
  if exists (select 1 from public.academy_members where user_id = uid) then
    return 'already_member';
  end if;
  select * into academy
  from public.academies
  where invite_code = clean
  for update;
  if not found then
    return 'invalid_code';
  end if;
  select p.plan into owner_plan
  from public.profiles p
  where p.id = academy.owner_id;
  if owner_plan is distinct from 'academy' then
    return 'academy_inactive';
  end if;
  select count(*)::integer into member_count
  from public.academy_members
  where academy_id = academy.id;
  if member_count >= academy.max_students then
    return 'academy_full';
  end if;
  insert into public.academy_members (academy_id, user_id)
  values (academy.id, uid);
  return 'ok';
exception when unique_violation then
  return 'already_member';
end;
$$;

-- Applies one newer Stripe subscription snapshot. Refuses manual entitlements,
-- stale events, customer swaps, and a second entitled subscription.
-- Does not delete academy members or lesson rows.
create or replace function public.apply_stripe_billing(
  uid uuid,
  event_created bigint,
  next_plan text,
  next_plan_key text,
  next_status text,
  next_subscription_id text,
  next_customer_id text,
  next_seats integer,
  next_period_end timestamptz,
  next_cancel_at_period_end boolean,
  next_hold text,
  set_provider boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles%rowtype;
  seats integer := next_seats;
begin
  if next_plan not in ('free', 'pro', 'academy') then
    return 'bad_plan';
  end if;
  if next_hold is not null and next_hold not in ('dispute', 'fraud_warning', 'refund') then
    return 'bad_hold';
  end if;
  if next_plan = 'academy' then
    if seats is null or seats not in (20, 40, 70, 100) then
      return 'bad_seats';
    end if;
  else
    seats := null;
  end if;

  select * into row from public.profiles where id = uid for update;
  if not found then
    return 'missing';
  end if;
  if row.billing_provider = 'manual' then
    return 'manual';
  end if;
  if row.billing_provider is null and row.plan is distinct from 'free' then
    return 'manual';
  end if;
  if event_created < row.billing_event_created then
    return 'stale';
  end if;
  if row.stripe_customer_id is not null
    and next_customer_id is not null
    and row.stripe_customer_id is distinct from next_customer_id then
    return 'customer_mismatch';
  end if;
  if row.billing_provider = 'stripe'
    and row.stripe_subscription_id is not null
    and next_subscription_id is not null
    and row.stripe_subscription_id is distinct from next_subscription_id
    and row.subscription_status in ('active', 'past_due')
    and row.plan is distinct from 'free'
    and next_plan is distinct from 'free' then
    return 'duplicate';
  end if;

  update public.profiles
  set
    plan = next_plan,
    billing_provider = case when set_provider then 'stripe' else profiles.billing_provider end,
    stripe_customer_id = coalesce(profiles.stripe_customer_id, next_customer_id),
    stripe_subscription_id = next_subscription_id,
    subscription_status = next_status,
    subscription_plan_key = next_plan_key,
    academy_seat_limit = seats,
    current_period_end = next_period_end,
    cancel_at_period_end = coalesce(next_cancel_at_period_end, false),
    billing_event_created = event_created,
    billing_hold = next_hold
  where id = uid;

  if next_plan = 'academy' then
    update public.academies
    set max_students = seats
    where owner_id = uid;
  end if;

  return 'ok';
end;
$$;

revoke all on function public.apply_stripe_billing(
  uuid, bigint, text, text, text, text, text, integer, timestamptz, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.apply_stripe_billing(
  uuid, bigint, text, text, text, text, text, integer, timestamptz, boolean, text, boolean
) to service_role;
