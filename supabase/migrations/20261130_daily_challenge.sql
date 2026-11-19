-- Daily challenge. One scored attempt per learner per Europe/Madrid day.
-- The three exercises are chosen in the app from exercise_bank. This table only stores the attempt.
-- It does not change test_results, lessons_used, Gemini, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.

create table if not exists public.daily_challenge_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  madrid_day date not null,
  level text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  correct integer,
  total integer,
  reading_correct integer,
  listening_correct integer,
  grammar_correct integer,
  reading_total integer,
  listening_total integer,
  grammar_total integer,
  primary key (user_id, madrid_day),
  constraint daily_challenge_level_check check (level in ('B1', 'B2', 'C1')),
  constraint daily_challenge_score_check check (
    (
      submitted_at is null
      and correct is null
      and total is null
    )
    or (
      submitted_at is not null
      and total > 0
      and correct >= 0
      and correct <= total
      and reading_total > 0
      and listening_total > 0
      and grammar_total > 0
      and reading_correct >= 0
      and reading_correct <= reading_total
      and listening_correct >= 0
      and listening_correct <= listening_total
      and grammar_correct >= 0
      and grammar_correct <= grammar_total
      and correct = reading_correct + listening_correct + grammar_correct
      and total = reading_total + listening_total + grammar_total
    )
  )
);

alter table public.daily_challenge_attempts enable row level security;

drop policy if exists daily_challenge_own on public.daily_challenge_attempts;
create policy daily_challenge_own on public.daily_challenge_attempts
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.daily_challenge_attempts from public, anon, authenticated;
grant select on public.daily_challenge_attempts to authenticated;

create or replace function public.daily_challenge_board(p_level text)
returns table (
  alias text,
  is_self boolean,
  correct integer,
  total integer,
  seconds integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  academy uuid;
  individual boolean;
begin
  if me is null or p_level not in ('B1', 'B2', 'C1') then
    return;
  end if;

  select m.academy_id into academy
    from public.academy_members m
    where m.user_id = me
    limit 1;

  if academy is null then
    select a.id into academy
    from public.academies a
    where a.owner_id = me
    limit 1;
  end if;

  individual := academy is null;

  return query
  with people as (
    select p.id as user_id
    from public.profiles p
    where individual
      and not exists (select 1 from public.academy_members m where m.user_id = p.id)
      and not exists (select 1 from public.academies a where a.owner_id = p.id)
    union
    select m.user_id
    from public.academy_members m
    where academy is not null
      and m.academy_id = academy
    union
    select a.owner_id
    from public.academies a
    where academy is not null
      and a.id = academy
  )
  select
    case
      when btrim(coalesce(pr.scoreboard_alias, '')) <> ''
        and position('@' in pr.scoreboard_alias) = 0
        then left(btrim(pr.scoreboard_alias), 40)
      when not individual
        and btrim(coalesce(pr.display_name, '')) <> ''
        and position('@' in pr.display_name) = 0
        then left(btrim(pr.display_name), 40)
      else 'Learner ' || upper(substr(pr.id::text, 1, 4))
    end,
    pr.id = me,
    attempt.correct,
    attempt.total,
    greatest(0, floor(extract(epoch from (attempt.submitted_at - attempt.started_at))))::integer
  from people person
  join public.daily_challenge_attempts attempt
    on attempt.user_id = person.user_id
    and attempt.madrid_day = (timezone('Europe/Madrid', now()))::date
    and attempt.level = p_level
    and attempt.submitted_at is not null
  join public.profiles pr on pr.id = person.user_id;
end;
$$;

revoke all on function public.daily_challenge_board(text) from public, anon;
grant execute on function public.daily_challenge_board(text) to authenticated;
