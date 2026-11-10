-- Saved grammar sets, separate from reading and listening.
-- Safe to run more than once. Does not change saved_lessons, its trigger, or the 5-lesson limit.
-- Apply this on production before grammar sets can be stored. Until then the app keeps
-- reading and listening saves as they are and skips grammar saves.

create table if not exists public.saved_grammar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null default '',
  lesson jsonb not null default '{}'::jsonb
);

create index if not exists saved_grammar_user_created_idx
  on public.saved_grammar (user_id, created_at desc);

alter table public.saved_grammar enable row level security;

grant select, insert, update, delete on public.saved_grammar to authenticated;

drop policy if exists saved_grammar_own on public.saved_grammar;
create policy saved_grammar_own on public.saved_grammar
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep the 5 newest grammar sets for the user who just saved one.
-- Reading and listening rows live in saved_lessons and are not touched.
create or replace function public.keep_latest_saved_grammar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.saved_grammar
  where user_id = new.user_id
    and id not in (
      select id from public.saved_grammar
      where user_id = new.user_id
      order by created_at desc
      limit 5
    );
  return new;
end;
$$;

drop trigger if exists saved_grammar_keep_latest on public.saved_grammar;
create trigger saved_grammar_keep_latest
  after insert on public.saved_grammar
  for each row
  execute function public.keep_latest_saved_grammar();
