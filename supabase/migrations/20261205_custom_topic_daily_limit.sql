-- Counts typed custom topics only. List topics, Any topic, and an empty bank are not counted.
-- A site deploy does not apply this. Run it in Supabase when this pull request is published.
-- It does not change Stripe, Gemini model settings, or the 12-lesson function.
-- The app also allows a lesson when that old function returns free_limit.

create table if not exists public.custom_topic_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  madrid_day date not null,
  used integer not null default 0,
  primary key (user_id, madrid_day)
);

alter table public.custom_topic_days enable row level security;
revoke all on public.custom_topic_days from public, anon, authenticated;

create or replace function public.take_custom_topic(uid uuid, day_limit integer default 5)
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

  insert into public.custom_topic_days (user_id, madrid_day, used)
  values (uid, today, 0)
  on conflict (user_id, madrid_day) do nothing;

  select days.used into next_used
  from public.custom_topic_days days
  where days.user_id = uid and days.madrid_day = today
  for update;

  if next_used >= cap then
    return query select false, next_used;
    return;
  end if;

  update public.custom_topic_days
  set used = custom_topic_days.used + 1
  where user_id = uid and madrid_day = today
  returning custom_topic_days.used into next_used;

  return query select true, next_used;
end;
$$;

revoke all on function public.take_custom_topic(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_custom_topic(uuid, integer) to service_role;
