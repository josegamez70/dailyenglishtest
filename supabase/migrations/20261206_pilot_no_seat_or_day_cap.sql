-- Pilot academies no longer expire after 20 days and no longer stop at 20 students.
-- A paid or hand-set academy keeps its own seat limit.
-- This file is not applied by a deploy. Run it in Supabase when this pull request is published.
-- It does not change Stripe, Gemini, or the custom-topic daily limit.

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
  );
$$;

create or replace function public.lesson_block_reason(uid uuid, free_limit integer default 12)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.profiles%rowtype;
  student_open boolean;
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
      and row.pilot_invitation_id is null
      and row.billing_provider is distinct from 'pilot'
    ) then
    return 'ok_unlimited';
  end if;

  if row.billing_provider = 'pilot'
    or row.pilot_invitation_id is not null
    or row.pilot_expires_at is not null then
    return 'ok_unlimited';
  end if;

  select exists (
    select 1
    from public.academy_members m
    join public.academies a on a.id = m.academy_id
    join public.profiles o on o.id = a.owner_id
    where m.user_id = uid
      and o.plan = 'academy'
      and (
        o.billing_provider = 'pilot'
        or o.pilot_invitation_id is not null
        or o.pilot_expires_at is not null
      )
  ) into student_open;

  if student_open then
    return 'ok_unlimited';
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
  owner_billing text;
  owner_invite uuid;
  pilot_end timestamptz;
  is_pilot boolean;
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
  select p.plan, p.billing_provider, p.pilot_invitation_id, p.pilot_expires_at
    into owner_plan, owner_billing, owner_invite, pilot_end
  from public.profiles p
  where p.id = academy.owner_id;
  if owner_plan is distinct from 'academy' then
    return 'academy_inactive';
  end if;
  is_pilot := owner_billing = 'pilot'
    or owner_invite is not null
    or pilot_end is not null;
  if not is_pilot then
    select count(*)::integer into member_count
    from public.academy_members
    where academy_id = academy.id;
    if member_count >= academy.max_students then
      return 'academy_full';
    end if;
  end if;
  insert into public.academy_members (academy_id, user_id)
  values (academy.id, uid);
  if is_pilot then
    update public.profiles
    set pilot_free_blocked = true
    where id = uid;
  end if;
  return 'ok';
exception when unique_violation then
  return 'already_member';
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

  update public.academy_pilot_invitations
  set redeemed_at = now(),
      redeemed_by = uid,
      expires_at = null
  where id = invite.id;

  update public.profiles
  set plan = 'academy',
      billing_provider = 'pilot',
      -- The profile check only allows 20, 40, 70, or 100. join_academy does not enforce this for a pilot.
      academy_seat_limit = 20,
      pilot_expires_at = null,
      pilot_invitation_id = invite.id,
      pilot_free_blocked = true
  where id = uid;

  return 'ok';
end;
$$;

revoke all on function public.academy_lesson_access(uuid) from public, anon, authenticated;
grant execute on function public.academy_lesson_access(uuid) to service_role;
revoke all on function public.lesson_block_reason(uuid, integer) from public, anon, authenticated;
grant execute on function public.lesson_block_reason(uuid, integer) to service_role;
revoke all on function public.join_academy(text) from public, anon;
grant execute on function public.join_academy(text) to authenticated;
revoke all on function public.redeem_pilot_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_pilot_invitation(uuid, text) to service_role;
