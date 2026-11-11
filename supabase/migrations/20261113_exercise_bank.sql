-- Pre-generated exercises. Grammar is filled first.
-- A row is one playable set, in the same JSON shape the app already returns.
-- Listening and reading can use this table later (kind). Cached speech audio
-- belongs in Supabase Storage; this table only stores the path, not the file.
-- Serves record which sets a person has already been given.
-- This does not change saved lessons, consume_lesson, academies, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

create table if not exists public.exercise_bank (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  level text not null,
  exercise_type text not null,
  dimensions jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint exercise_bank_kind_check check (kind in ('grammar', 'listening', 'reading')),
  constraint exercise_bank_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint exercise_bank_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint exercise_bank_dimensions_object_check check (jsonb_typeof(dimensions) = 'object'),
  constraint exercise_bank_grammar_slot_check check (
    kind <> 'grammar'
    or (
      level in ('B1', 'B2', 'C1')
      and exercise_type in ('blanks', 'phrasal', 'order')
      and payload->>'mode' = 'grammar'
      and payload->>'level' = level
      and payload->>'exercise' = exercise_type
      and coalesce(payload->>'topic', '') = ''
      and coalesce(dimensions->>'topic', '') = ''
      and case
        when jsonb_typeof(payload->'items') = 'array'
          then jsonb_array_length(payload->'items') between 4 and 6
        else false
      end
    )
  )
);

create unique index if not exists exercise_bank_content_hash_idx
  on public.exercise_bank (content_hash);

create index if not exists exercise_bank_grammar_recent_idx
  on public.exercise_bank (level, exercise_type, created_at desc, id desc)
  where kind = 'grammar';

create table if not exists public.exercise_bank_serves (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercise_bank (id) on delete cascade,
  served_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create index if not exists exercise_bank_serves_exercise_idx
  on public.exercise_bank_serves (exercise_id);

alter table public.exercise_bank enable row level security;
alter table public.exercise_bank_serves enable row level security;

revoke all on public.exercise_bank from public, anon, authenticated;
revoke all on public.exercise_bank_serves from public, anon, authenticated;
grant select on public.exercise_bank_serves to authenticated;
grant select, insert, update, delete on public.exercise_bank to service_role;
grant select, insert, update, delete on public.exercise_bank_serves to service_role;

-- The bank includes the answers. Signed-in clients do not read it.
-- The server uses the service role, which bypasses these policies.
drop policy if exists exercise_bank_deny_clients on public.exercise_bank;
create policy exercise_bank_deny_clients on public.exercise_bank
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- A person can see which sets they have been given. They cannot mark sets themselves.
drop policy if exists exercise_bank_serves_own on public.exercise_bank_serves;
create policy exercise_bank_serves_own on public.exercise_bank_serves
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.exercise_bank is
  'Pre-generated exercises keyed by kind. Grammar rows are one set for a B1/B2/C1 level and a blanks, phrasal, or order exercise. Listening audio files belong in Supabase Storage, with the object path in dimensions.';

comment on column public.exercise_bank.payload is
  'Exercise JSON in the shape the app already returns. Grammar uses mode, level, exercise, topic, title, and items.';

comment on column public.exercise_bank.dimensions is
  'Extra key for this kind. Grammar leaves it empty. A listening row can store the Storage path of cached speech audio here.';

comment on column public.exercise_bank.content_hash is
  'SHA-256 of the kind, level, exercise, prompts, and answers. Option order is ignored so a reshuffle is not a new row.';

-- Picks one unseen grammar set and records the serve. Only the service role may call it,
-- because the payload contains the answers. security invoker keeps it from bypassing RLS
-- if a browser role ever gained execute.
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

comment on function public.claim_grammar_bank_item(uuid, text, text) is
  'Service-role only. Claims one grammar set this person has not been served.';
