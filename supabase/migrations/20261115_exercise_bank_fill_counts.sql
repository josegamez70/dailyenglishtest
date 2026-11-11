-- Counts stored exercises per combination so the Monday refill can prefer the thinnest cells.
-- Claim, serves, storage, saved lessons, and billing stay as they are.
-- The service role calls this. The browser cannot.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once. Until it is applied, the refill still spreads by level and format
-- and treats every combination as empty.

create or replace function public.exercise_bank_fill_counts(bank_kind text)
returns table (
  level text,
  exercise_type text,
  topic text,
  word_count integer,
  question_count integer,
  n bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.level,
    b.exercise_type,
    case when bank_kind = 'listening' then coalesce(b.dimensions->>'topic', '') else '' end,
    case when bank_kind = 'listening' then coalesce((b.dimensions->>'wordCount')::integer, 0) else 0 end,
    case when bank_kind = 'listening' then coalesce((b.dimensions->>'questionCount')::integer, 0) else 0 end,
    count(*)::bigint
  from public.exercise_bank b
  where b.kind = bank_kind
    and bank_kind in ('grammar', 'listening')
  group by 1, 2, 3, 4, 5;
$$;

revoke all on function public.exercise_bank_fill_counts(text) from public, anon, authenticated;
grant execute on function public.exercise_bank_fill_counts(text) to service_role;

comment on function public.exercise_bank_fill_counts(text) is
  'Service-role only. Row counts per grammar level and exercise, or per listening level, format, topic, length, and question count. No lesson text and no answers.';
