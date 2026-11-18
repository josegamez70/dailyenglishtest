-- Extends the scoreboard. Does not edit 20261124_scoreboard.sql and does not change test_results.
-- Yesterday is the previous Europe/Madrid calendar date, so the clock change is handled by the time zone.
-- A learner in an academy sees that academy. A learner with no academy shares one board with the other individual learners.
-- Individual rows use the chosen alias only. A display name is not shown there, and an email address is never shown.

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
      when not individual
        and btrim(coalesce(pr.display_name, '')) <> ''
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
