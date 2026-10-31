-- Progress, saved lessons, and profile preferences.
-- Safe to run more than once. Does not change consume_lesson or plan limits.

alter table public.profiles add column if not exists theme text not null default 'system';
alter table public.profiles add column if not exists default_level text not null default 'A2';
alter table public.profiles add column if not exists voice text not null default 'british';
alter table public.profiles add column if not exists speed numeric not null default 1;
alter table public.profiles add column if not exists display_name text not null default '';

-- Signed-in users may save their own preferences. Plan and lesson counts stay server-only.
grant update (theme, default_level, voice, speed, display_name) on public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

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
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_limits on public.profiles;
create trigger profiles_protect_limits
  before update on public.profiles
  for each row
  execute function public.protect_profile_limits();

create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  level text not null default '',
  topic text not null default '',
  title text not null default '',
  score integer not null default 0,
  total integer not null default 0,
  wrong_answers jsonb not null default '[]'::jsonb
);

create index if not exists test_results_user_created_idx
  on public.test_results (user_id, created_at desc);

create table if not exists public.saved_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null default '',
  lesson jsonb not null default '{}'::jsonb
);

create index if not exists saved_lessons_user_created_idx
  on public.saved_lessons (user_id, created_at desc);

alter table public.test_results enable row level security;
alter table public.saved_lessons enable row level security;

grant select, insert, update, delete on public.test_results to authenticated;
grant select, insert, update, delete on public.saved_lessons to authenticated;

drop policy if exists test_results_own on public.test_results;
create policy test_results_own on public.test_results
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists saved_lessons_own on public.saved_lessons;
create policy saved_lessons_own on public.saved_lessons
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.keep_latest_saved_lessons()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.saved_lessons
  where user_id = new.user_id
    and id not in (
      select id from public.saved_lessons
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists saved_lessons_keep_latest on public.saved_lessons;
create trigger saved_lessons_keep_latest
  after insert on public.saved_lessons
  for each row
  execute function public.keep_latest_saved_lessons();
