-- Personal vocabulary for a signed-in person, including academy students.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.
-- Until this runs, the app still opens and says vocabulary will be ready after the database update.

create table if not exists public.saved_vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  term text not null,
  meaning text not null default '',
  example text not null default '',
  source_type text not null default '' check (source_type in ('reading', 'listening', 'lookup', '')),
  lesson_title text not null default '',
  topic text not null default '',
  level text not null default '',
  created_at timestamptz not null default now(),
  correct_count integer not null default 0,
  wrong_count integer not null default 0
);

create unique index if not exists saved_vocabulary_user_term_uidx
  on public.saved_vocabulary (user_id, lower(term));

create index if not exists saved_vocabulary_user_created_idx
  on public.saved_vocabulary (user_id, created_at desc);

alter table public.saved_vocabulary enable row level security;

grant select, insert, update, delete on public.saved_vocabulary to authenticated;

drop policy if exists saved_vocabulary_own on public.saved_vocabulary;
create policy saved_vocabulary_own on public.saved_vocabulary
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
