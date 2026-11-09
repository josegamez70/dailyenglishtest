-- Private academy pilot invitations. Run after 20261107_billing.sql.
-- Reviewed only. Do not apply from the app deploy. Service role writes invitations.
-- Signed-in users cannot read or write invitation codes, pilot expiry, or admin identity.

alter table public.profiles add column if not exists pilot_expires_at timestamptz;
alter table public.profiles add column if not exists pilot_invitation_id uuid;
alter table public.profiles add column if not exists pilot_free_blocked boolean not null default false;

alter table public.profiles drop constraint if exists profiles_billing_provider_chk;
alter table public.profiles
  add constraint profiles_billing_provider_chk
  check (billing_provider is null or billing_provider in ('manual', 'stripe', 'pilot'));

create table if not exists public.academy_pilot_invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid,
  expires_at timestamptz,
  academy_id uuid references public.academies (id),
  constraint academy_pilot_label_len check (char_length(btrim(label)) between 1 and 60),
  constraint academy_pilot_code_len check (char_length(code) between 43 and 80)
);

create unique index if not exists academy_pilot_one_redemption_per_user
  on public.academy_pilot_invitations (redeemed_by)
  where redeemed_by is not null;

create unique index if not exists profiles_one_pilot_invitation
  on public.profiles (pilot_invitation_id)
  where pilot_invitation_id is not null;

alter table public.academy_pilot_invitations enable row level security;
revoke all on public.academy_pilot_invitations from public, anon, authenticated;

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
    new.pilot_expires_at := old.pilot_expires_at;
    new.pilot_invitation_id := old.pilot_invitation_id;
    new.pilot_free_blocked := old.pilot_free_blocked;
  end if;
  return new;
end;
$$;

create or replace function public.academy_lesson_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_members m
    join public.academies a on a.id = m.academy_id
    join public.profiles owner_profile on owner_profile.id = a.owner_id
    where m.user_id = uid
      and owner_profile.plan = 'academy'
      and (
        owner_profile.pilot_expires_at is null
        or owner_profile.pilot_expires_at > now()
      )
  );
$$;

create or replace function public.lesson_block_reason(uid uuid, free_limit integer default 3)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.profiles%rowtype;
  student_expiry timestamptz;
begin
  select * into row from public.profiles where id = uid;
  if not found then
    return 'missing';
  end if;

  if row.billing_provider = 'stripe'
    or row.plan = 'tester'
    or (row.plan = 'pro' and row.billing_provider is distinct from 'pilot')
    or (
      row.plan = 'academy'
      and row.pilot_expires_at is null
      and row.billing_provider is distinct from 'pilot'
    ) then
    return 'ok_unlimited';
  end if;

  if row.pilot_expires_at is not null then
    if row.pilot_expires_at > now() then
      return 'ok_unlimited';
    end if;
    return 'pilot_expired';
  end if;

  select o.pilot_expires_at into student_expiry
  from public.academy_members m
  join public.academies a on a.id = m.academy_id
  join public.profiles o on o.id = a.owner_id
  where m.user_id = uid
    and o.pilot_expires_at is not null
  limit 1;

  if student_expiry is not null then
    if student_expiry > now() then
      return 'ok_unlimited';
    end if;
    return 'pilot_expired';
  end if;

  if public.academy_lesson_access(uid) then
    return 'ok_unlimited';
  end if;

  if row.pilot_free_blocked then
    return 'pilot_expired';
  end if;

  if row.plan is distinct from 'free' then
    return 'ok_unlimited';
  end if;

  if row.lessons_used >= free_limit then
    return 'free_limit';
  end if;

  return 'ok_free';
end;
$$;

drop function if exists public.consume_lesson(uuid, integer);

create or replace function public.consume_lesson(uid uuid, free_limit integer default 3)
returns table (allowed boolean, lessons_used integer, plan text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  current_used integer;
  block text;
begin
  select p.plan, p.lessons_used
    into current_plan, current_used
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    return query select false, 0, 'free'::text, 'missing'::text;
    return;
  end if;

  block := public.lesson_block_reason(uid, free_limit);
  if block = 'ok_unlimited' then
    return query select true, current_used, current_plan, 'ok'::text;
    return;
  end if;
  if block = 'pilot_expired' or block = 'free_limit' or block = 'missing' then
    return query select false, current_used, current_plan, block;
    return;
  end if;

  update public.profiles
  set lessons_used = profiles.lessons_used + 1
  where id = uid
  returning profiles.lessons_used, profiles.plan
  into current_used, current_plan;

  return query select true, current_used, current_plan, 'ok'::text;
end;
$$;

revoke all on function public.lesson_block_reason(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_lesson(uuid, integer) from public, anon, authenticated;
grant execute on function public.lesson_block_reason(uuid, integer) to service_role;
grant execute on function public.consume_lesson(uuid, integer) to service_role;

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
  pilot_end timestamptz;
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
  select p.plan, p.academy_seat_limit, p.pilot_expires_at
    into owner_plan, seat_cap, pilot_end
  from public.profiles p
  where p.id = uid;
  if owner_plan is distinct from 'academy' then
    return 'not_academy_plan';
  end if;
  if pilot_end is not null and pilot_end <= now() then
    return 'academy_inactive';
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
  pilot_end timestamptz;
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
  select p.plan, p.pilot_expires_at into owner_plan, pilot_end
  from public.profiles p
  where p.id = academy.owner_id;
  if owner_plan is distinct from 'academy' then
    return 'academy_inactive';
  end if;
  if pilot_end is not null and pilot_end <= now() then
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
  if pilot_end is not null then
    update public.profiles
    set pilot_free_blocked = true
    where id = uid;
  end if;
  return 'ok';
exception when unique_violation then
  return 'already_member';
end;
$$;

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
  if row.billing_provider = 'pilot' then
    return 'pilot';
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

create or replace function public.redeem_pilot_invitation(uid uuid, invite_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.academy_pilot_invitations%rowtype;
  actor public.profiles%rowtype;
  pilot_end timestamptz;
begin
  if uid is null then
    return 'auth_required';
  end if;
  if invite_code is null or char_length(invite_code) < 43 then
    return 'invalid';
  end if;

  select * into invite
  from public.academy_pilot_invitations
  where code = invite_code
  for update;
  if not found then
    return 'invalid';
  end if;

  select * into actor from public.profiles where id = uid for update;
  if not found then
    return 'missing_profile';
  end if;

  if invite.redeemed_by = uid then
    return 'idempotent';
  end if;
  if invite.revoked_at is not null then
    return 'revoked';
  end if;
  if invite.redeemed_by is not null then
    return 'used';
  end if;
  if actor.plan = 'tester' then
    return 'conflict_tester';
  end if;
  if actor.billing_provider = 'stripe' or (actor.plan = 'pro' and actor.billing_provider is distinct from 'pilot') then
    return 'conflict_paid';
  end if;
  if actor.billing_provider = 'manual'
    or (actor.plan = 'academy' and actor.billing_provider is distinct from 'pilot' and actor.pilot_invitation_id is null) then
    return 'conflict_manual';
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_academy';
  end if;
  if actor.pilot_invitation_id is not null then
    return 'already_piloted';
  end if;

  pilot_end := now() + interval '20 days';
  update public.academy_pilot_invitations
  set redeemed_at = now(),
      redeemed_by = uid,
      expires_at = pilot_end
  where id = invite.id;

  update public.profiles
  set plan = 'academy',
      billing_provider = 'pilot',
      academy_seat_limit = 20,
      pilot_expires_at = pilot_end,
      pilot_invitation_id = invite.id,
      pilot_free_blocked = true
  where id = uid;

  return 'ok';
end;
$$;

revoke all on function public.redeem_pilot_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_pilot_invitation(uuid, text) to service_role;
