-- Individual free accounts get 12 lessons. Remaining is 12 minus lessons_used.
-- Academy seats, paid plans, pilots, and consume_lesson behaviour are unchanged.
-- The app also passes free_limit on every call. This updates the default for a call that omits it.

create or replace function public.lesson_block_reason(uid uuid, free_limit integer default 12)
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

create or replace function public.consume_lesson(uid uuid, free_limit integer default 12)
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
