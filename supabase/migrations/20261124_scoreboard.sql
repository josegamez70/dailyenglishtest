-- Academic scoreboard. Additive only. Do not apply this on production until it is reviewed.
-- It does not update test_results, saved lessons, or any existing score.
-- Seven older test_results rows have no mode. They stay as they are and are left out of the totals.

alter table public.profiles
  add column if not exists scoreboard_alias text not null default '';

grant update (scoreboard_alias) on public.profiles to authenticated;

-- Students can read only their own results. Owners can read their academy.
-- This function is the classmate view: one academy, aliases and totals, and no mailbox address or user id.
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
  period text := case when p_period = 'daily' then 'daily' else 'all' end;
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

  return query
  with people as (
    select me as user_id
    where academy is null
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
        period <> 'daily'
        or (timezone('Europe/Madrid', r.created_at))::date
          = (timezone('Europe/Madrid', now()))::date
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
