-- Retro Legends. Does not change test_results, Gemini, or billing.
-- A finished scored exercise is one row. Repeating the same content does not add another.
-- Existing reading, listening, and grammar results are copied once. Vocabulary starts at zero.
-- Those copied achievements are inserted here, so the app does not pop them up again.
-- A site deploy does not apply this. Run it in Supabase after it is approved.

create table if not exists public.lesson_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  modality text not null,
  dedupe_key text not null,
  score integer not null,
  total integer not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, modality, dedupe_key),
  constraint lesson_completions_modality_check check (modality in ('reading', 'listening', 'grammar', 'vocabulary')),
  constraint lesson_completions_score_check check (total > 0 and score >= 0 and score <= total),
  constraint lesson_completions_key_check check (
    dedupe_key ~ '^legacy:[0-9a-fA-F-]{36}$'
    or dedupe_key ~ '^[0-9a-f]{64}$'
  )
);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.lesson_completions enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists lesson_completions_own on public.lesson_completions;
create policy lesson_completions_own on public.lesson_completions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_achievements_own on public.user_achievements;
create policy user_achievements_own on public.user_achievements
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.lesson_completions from public, anon, authenticated;
revoke all on public.user_achievements from public, anon, authenticated;
grant select on public.lesson_completions to authenticated;
grant select on public.user_achievements to authenticated;

insert into public.lesson_completions (user_id, modality, dedupe_key, score, total, completed_at)
select r.user_id, r.mode, 'legacy:' || r.id::text, r.score, r.total, r.created_at
from public.test_results r
where r.mode in ('reading', 'listening', 'grammar')
  and r.total > 0
  and r.score >= 0
  and r.score <= r.total
on conflict do nothing;

create or replace function public.legends_grant(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  awarded text[] := '{}';
  rec record;
begin
  for rec in
    with counts as (
      select
        count(*) filter (where modality = 'reading')::int as reading,
        count(*) filter (where modality = 'listening')::int as listening,
        count(*) filter (where modality = 'grammar')::int as grammar,
        count(*) filter (where modality = 'vocabulary')::int as vocabulary,
        count(*)::int as total
      from public.lesson_completions
      where user_id = p_user
    ),
    due as (
      select item.id
      from counts c
      join (values
        ('rookie', 5),
        ('first_steps', 10),
        ('retro_player', 25),
        ('arcade_starter', 50),
        ('century_club', 100),
        ('power_user', 250),
        ('english_master', 500),
        ('retro_legend', 1000),
        ('hall_of_fame', 2500),
        ('ultimate_legend', 5000)
      ) as item(id, need) on c.total >= item.need
      union all
      select modality || '_' || need::text
      from counts c
      cross join (values ('reading'), ('listening'), ('grammar'), ('vocabulary')) as m(modality)
      cross join (values (10), (50), (100), (500)) as n(need)
      where case m.modality
        when 'reading' then c.reading
        when 'listening' then c.listening
        when 'grammar' then c.grammar
        else c.vocabulary
      end >= n.need
    )
    select id from due
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user, rec.id)
    on conflict do nothing;
    if found then
      awarded := awarded || rec.id;
    end if;
  end loop;
  return awarded;
end;
$$;

select public.legends_grant(user_id)
from (
  select distinct user_id from public.lesson_completions
) people;

create or replace function public.record_lesson_completion(
  p_modality text,
  p_key text,
  p_score integer,
  p_total integer
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inserted boolean := false;
begin
  if me is null
    or p_modality not in ('reading', 'listening', 'grammar', 'vocabulary')
    or p_key !~ '^[0-9a-f]{64}$'
    or p_total is null or p_total <= 0
    or p_score is null or p_score < 0 or p_score > p_total then
    return '{}';
  end if;
  insert into public.lesson_completions (user_id, modality, dedupe_key, score, total)
  values (me, p_modality, p_key, p_score, p_total)
  on conflict do nothing;
  inserted := found;
  if not inserted then
    return '{}';
  end if;
  return public.legends_grant(me);
end;
$$;

revoke all on function public.legends_grant(uuid) from public, anon, authenticated;
revoke all on function public.record_lesson_completion(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_lesson_completion(text, text, integer, integer) to authenticated;
