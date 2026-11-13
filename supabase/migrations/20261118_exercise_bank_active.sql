-- Retired grammar rows stay in the table so serve history still points at them.
-- Claim and the refill counts skip inactive rows. Nothing is deleted.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

alter table public.exercise_bank
  add column if not exists active boolean not null default true;

comment on column public.exercise_bank.active is
  'False when a row must not be served again. The row and its serve history stay.';

create or replace function public.claim_grammar_bank_item(
  uid uuid,
  grammar_level text,
  grammar_exercise text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  chosen uuid;
  body jsonb;
begin
  if uid is null
    or grammar_level not in ('B1', 'B2', 'C1')
    or grammar_exercise not in ('blanks', 'phrasal', 'order') then
    return jsonb_build_object('status', 'empty');
  end if;

  select b.id, b.payload
    into chosen, body
  from public.exercise_bank b
  where b.kind = 'grammar'
    and b.active
    and b.level = grammar_level
    and b.exercise_type = grammar_exercise
    and not exists (
      select 1
      from public.exercise_bank_serves s
      where s.user_id = uid
        and s.exercise_id = b.id
    )
  order by random()
  limit 1
  for update of b skip locked;

  if chosen is null then
    return jsonb_build_object('status', 'empty');
  end if;

  insert into public.exercise_bank_serves (user_id, exercise_id)
  values (uid, chosen);

  return jsonb_build_object('status', 'ok', 'id', chosen, 'payload', body);
exception
  when unique_violation then
    return jsonb_build_object('status', 'conflict');
end;
$$;

revoke all on function public.claim_grammar_bank_item(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_grammar_bank_item(uuid, text, text) to service_role;

create or replace function public.claim_listening_bank_item(
  uid uuid,
  listening_level text,
  listening_format text,
  listening_topic text,
  listening_words integer,
  listening_questions integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  chosen uuid;
  body jsonb;
  dims jsonb;
begin
  if uid is null
    or listening_level not in ('Beginner', 'Intermediate', 'Advanced')
    or listening_format not in ('text', 'dialogue')
    or listening_words not in (60, 100, 140)
    or listening_questions not in (5, 8, 10) then
    return jsonb_build_object('status', 'empty');
  end if;

  select b.id, b.payload, b.dimensions
    into chosen, body, dims
  from public.exercise_bank b
  where b.kind = 'listening'
    and b.active
    and b.level = listening_level
    and b.exercise_type = listening_format
    and (
      coalesce(listening_topic, '') = ''
      or listening_topic = 'wildcard'
      or b.dimensions->>'topic' = listening_topic
    )
    and (b.dimensions->>'wordCount')::int = listening_words
    and (b.dimensions->>'questionCount')::int = listening_questions
    and not exists (
      select 1
      from public.exercise_bank_serves s
      where s.user_id = uid
        and s.exercise_id = b.id
    )
  order by random()
  limit 1
  for update of b skip locked;

  if chosen is null then
    return jsonb_build_object('status', 'empty');
  end if;

  insert into public.exercise_bank_serves (user_id, exercise_id)
  values (uid, chosen);

  return jsonb_build_object('status', 'ok', 'id', chosen, 'payload', body, 'dimensions', dims);
exception
  when unique_violation then
    return jsonb_build_object('status', 'conflict');
end;
$$;

revoke all on function public.claim_listening_bank_item(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_listening_bank_item(uuid, text, text, text, integer, integer) to service_role;

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
    and b.active
    and bank_kind in ('grammar', 'listening')
  group by 1, 2, 3, 4, 5;
$$;

revoke all on function public.exercise_bank_fill_counts(text) from public, anon, authenticated;
grant execute on function public.exercise_bank_fill_counts(text) to service_role;
