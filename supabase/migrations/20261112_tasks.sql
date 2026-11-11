-- Tasks: one settings row per person, and one pack per day or week.
-- A pack is one reading exercise, one listening exercise, and one grammar exercise.
-- The newest 5 packs are kept. Older packs are deleted, with their exercises.
-- This does not change saved lessons, the 3 free lessons, consume_lesson, academies, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

create schema if not exists private;

create table if not exists public.task_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  enabled boolean not null default false,
  email_reminders boolean not null default true,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  topic text not null default 'daily life',
  word_count integer not null default 100 check (word_count in (60, 100, 140)),
  question_count integer not null default 5 check (question_count in (5, 8, 10)),
  reading_format text not null default 'text' check (reading_format in ('text', 'dialogue')),
  listening_format text not null default 'text' check (listening_format in ('text', 'dialogue')),
  grammar_level text not null default 'B1' check (grammar_level in ('B1', 'B2', 'C1')),
  grammar_exercise text not null default 'blanks' check (grammar_exercise in ('blanks', 'phrasal', 'order')),
  grammar_topic text not null default ''
);

create table if not exists public.task_email_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.task_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  period_key text not null,
  frequency text not null check (frequency in ('daily', 'weekly')),
  status text not null default 'generating' check (status in ('generating', 'ready', 'blocked')),
  charged boolean not null default false,
  emailed_at timestamptz,
  block_reason text not null default '',
  locked_until timestamptz,
  reading_done boolean not null default false,
  listening_done boolean not null default false,
  grammar_done boolean not null default false,
  completed_at timestamptz,
  unique (user_id, period_key)
);

create table if not exists public.task_pack_exercises (
  pack_id uuid primary key references public.task_packs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reading jsonb not null default '{}'::jsonb,
  listening jsonb not null default '{}'::jsonb,
  grammar jsonb not null default '{}'::jsonb
);

create index if not exists task_packs_user_created_idx
  on public.task_packs (user_id, created_at desc);

create index if not exists task_pack_exercises_user_idx
  on public.task_pack_exercises (user_id);

alter table public.task_settings enable row level security;
alter table public.task_email_tokens enable row level security;
alter table public.task_packs enable row level security;
alter table public.task_pack_exercises enable row level security;

grant select, insert, update, delete on public.task_settings to authenticated;
grant select, update on public.task_packs to authenticated;
grant select on public.task_pack_exercises to authenticated;
revoke all on public.task_email_tokens from public, anon, authenticated;

drop policy if exists task_settings_own on public.task_settings;
create policy task_settings_own on public.task_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Academy owners can see whether tasks are on. They cannot see the email token.
drop policy if exists task_settings_academy_read on public.task_settings;
create policy task_settings_academy_read on public.task_settings
  for select
  using (
    exists (
      select 1
      from public.academy_members m
      join public.academies a on a.id = m.academy_id
      where m.user_id = task_settings.user_id
        and a.owner_id = auth.uid()
    )
  );

drop policy if exists task_packs_own on public.task_packs;
create policy task_packs_own on public.task_packs
  for select
  using (auth.uid() = user_id);

drop policy if exists task_packs_own_update on public.task_packs;
create policy task_packs_own_update on public.task_packs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Completion only. Exercise text stays on task_pack_exercises, which owners cannot read.
drop policy if exists task_packs_academy_read on public.task_packs;
create policy task_packs_academy_read on public.task_packs
  for select
  using (
    exists (
      select 1
      from public.academy_members m
      join public.academies a on a.id = m.academy_id
      where m.user_id = task_packs.user_id
        and a.owner_id = auth.uid()
    )
  );

drop policy if exists task_pack_exercises_own on public.task_pack_exercises;
create policy task_pack_exercises_own on public.task_pack_exercises
  for select
  using (auth.uid() = user_id);

-- No policies on task_email_tokens. Only the database function and the service role can use it.

create or replace function private.guard_task_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' and new.user_id is distinct from auth.uid() then
      raise exception 'not allowed';
    end if;
    insert into public.task_email_tokens (user_id, token)
    values (
      new.user_id,
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    )
    on conflict (user_id) do nothing;
  elsif tg_op = 'UPDATE' and current_user = 'authenticated' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_task_settings() from public, anon;
grant execute on function private.guard_task_settings() to authenticated, service_role;

drop trigger if exists task_settings_guard on public.task_settings;
create trigger task_settings_guard
  before insert or update on public.task_settings
  for each row
  execute function private.guard_task_settings();

-- A signed-in person can mark an exercise done. They cannot change the pack itself.
create or replace function public.protect_task_pack()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.period_key := old.period_key;
    new.frequency := old.frequency;
    new.status := old.status;
    new.charged := old.charged;
    new.emailed_at := old.emailed_at;
    new.block_reason := old.block_reason;
    new.locked_until := old.locked_until;
    if old.reading_done then new.reading_done := true; end if;
    if old.listening_done then new.listening_done := true; end if;
    if old.grammar_done then new.grammar_done := true; end if;
    if new.reading_done and new.listening_done and new.grammar_done and old.completed_at is null then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists task_packs_protect on public.task_packs;
create trigger task_packs_protect
  before update on public.task_packs
  for each row
  execute function public.protect_task_pack();

create or replace function public.keep_latest_task_packs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.task_packs
  where user_id = new.user_id
    and id not in (
      select id from public.task_packs
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists task_packs_keep_latest on public.task_packs;
create trigger task_packs_keep_latest
  after insert on public.task_packs
  for each row
  execute function public.keep_latest_task_packs();
