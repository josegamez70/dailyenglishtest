-- Individual learners use the same public name as academy learners.
-- scoreboard_alias still wins. A display name is shown when it has no @.
-- Otherwise the label stays Learner plus the first four characters of the id.
-- A site deploy does not apply this. Run it in Supabase when this pull request is published.
-- Safe to run more than once. Signatures, grants, and security definer stay the same.

create or replace function public.scoreboard_board(p_period text default 'all')
returns table (
  alias text,
  is_self boolean,
  reading_done integer,
  reading_correct integer,
  reading_answered integer,
  listening_done integer,
  listening_correct integer,
  listening_answered integer,
  grammar_done integer,
  grammar_correct integer,
  grammar_answered integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  academy uuid;
  period text := case
    when p_period = 'daily' then 'daily'
    when p_period = 'yesterday' then 'yesterday'
    else 'all'
  end;
  individual boolean;
begin
  if me is null then
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
  ),
  agg as (
    select
      p.user_id,
      count(*) filter (where r.mode = 'reading')::integer as reading_done,
      coalesce(sum(r.score) filter (where r.mode = 'reading'), 0)::integer as reading_correct,
      coalesce(sum(r.total) filter (where r.mode = 'reading'), 0)::integer as reading_answered,
      count(*) filter (where r.mode = 'listening')::integer as listening_done,
      coalesce(sum(r.score) filter (where r.mode = 'listening'), 0)::integer as listening_correct,
      coalesce(sum(r.total) filter (where r.mode = 'listening'), 0)::integer as listening_answered,
      count(*) filter (where r.mode = 'grammar')::integer as grammar_done,
      coalesce(sum(r.score) filter (where r.mode = 'grammar'), 0)::integer as grammar_correct,
      coalesce(sum(r.total) filter (where r.mode = 'grammar'), 0)::integer as grammar_answered
    from people p
    left join public.test_results r
      on r.user_id = p.user_id
      and r.mode in ('reading', 'listening', 'grammar')
      and r.total > 0
      and (
        period = 'all'
        or (
          period = 'daily'
          and (timezone('Europe/Madrid', r.created_at))::date = (timezone('Europe/Madrid', now()))::date
        )
        or (
          period = 'yesterday'
          and (timezone('Europe/Madrid', r.created_at))::date = ((timezone('Europe/Madrid', now()))::date - 1)
        )
      )
    group by p.user_id
  )
  select
    case
      when btrim(coalesce(pr.scoreboard_alias, '')) <> ''
        and position('@' in pr.scoreboard_alias) = 0
        then left(btrim(pr.scoreboard_alias), 40)
      when btrim(coalesce(pr.display_name, '')) <> ''
        and position('@' in pr.display_name) = 0
        then left(btrim(pr.display_name), 40)
      else 'Learner ' || upper(substr(pr.id::text, 1, 4))
    end,
    pr.id = me,
    agg.reading_done,
    agg.reading_correct,
    agg.reading_answered,
    agg.listening_done,
    agg.listening_correct,
    agg.listening_answered,
    agg.grammar_done,
    agg.grammar_correct,
    agg.grammar_answered
  from agg
  join public.profiles pr on pr.id = agg.user_id;
end;
$$;


revoke all on function public.scoreboard_board(text) from public, anon;
grant execute on function public.scoreboard_board(text) to authenticated;

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
      when btrim(coalesce(pr.display_name, '')) <> ''
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
