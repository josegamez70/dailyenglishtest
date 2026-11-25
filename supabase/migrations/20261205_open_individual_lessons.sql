-- Removes the 12-lesson stop for individual free accounts.
-- Live Gemini lessons are limited to 5 per Madrid day, including when the bank has nothing unseen.
-- A lesson served from the bank does not call take_live_lesson.
-- A site deploy does not apply this. Run it in Supabase when this pull request is published.
-- It does not change Stripe, Gemini model settings, or existing scores.

create table if not exists public.live_lesson_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  madrid_day date not null,
  used integer not null default 0,
  primary key (user_id, madrid_day)
);

alter table public.live_lesson_days enable row level security;
revoke all on public.live_lesson_days from public, anon, authenticated;

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

  -- The old lessons_used >= free_limit stop is gone. free_limit stays in the signature.
  if row.plan is distinct from 'free' then
    return 'ok_unlimited';
  end if;

  return 'ok_free';
end;
$$;

create or replace function public.take_live_lesson(uid uuid, day_limit integer default 5)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Europe/Madrid', now()))::date;
  next_used integer;
  cap integer := greatest(1, coalesce(day_limit, 5));
begin
  if uid is null then
    return query select false, 0;
    return;
  end if;

  insert into public.live_lesson_days (user_id, madrid_day, used)
  values (uid, today, 0)
  on conflict (user_id, madrid_day) do nothing;

  select live.used into next_used
  from public.live_lesson_days live
  where live.user_id = uid and live.madrid_day = today
  for update;

  if next_used >= cap then
    return query select false, next_used;
    return;
  end if;

  update public.live_lesson_days
  set used = live_lesson_days.used + 1
  where user_id = uid and madrid_day = today
  returning live_lesson_days.used into next_used;

  return query select true, next_used;
end;
$$;

revoke all on function public.take_live_lesson(uuid, integer) from public, anon;
grant execute on function public.take_live_lesson(uuid, integer) to service_role;
