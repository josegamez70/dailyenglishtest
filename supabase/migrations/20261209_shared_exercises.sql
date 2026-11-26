-- Short public links for a shared exercise. Does not change existing rows or tables.

create table if not exists public.shared_exercises (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  handle text not null default '',
  score integer,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint shared_exercises_score_check check (score is null or (score >= 0 and score <= 100)),
  constraint shared_exercises_payload_check check (jsonb_typeof(payload) = 'object')
);

alter table public.shared_exercises enable row level security;

revoke all on public.shared_exercises from public, anon, authenticated;

create or replace function public.create_shared_exercise(
  p_handle text,
  p_score integer,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clean text;
begin
  if auth.uid() is null then
    raise exception 'share_signin';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'share_payload';
  end if;
  if octet_length(p_payload::text) > 200000 then
    raise exception 'share_too_big';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'share_score';
  end if;
  clean := left(btrim(coalesce(p_handle, '')), 24);
  insert into public.shared_exercises (sender_id, handle, score, payload)
  values (auth.uid(), clean, p_score, p_payload)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.read_shared_exercise(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'handle', handle,
    'score', score,
    'payload', payload
  )
  from public.shared_exercises
  where id = p_id;
$$;

revoke all on function public.create_shared_exercise(text, integer, jsonb) from public;
revoke all on function public.read_shared_exercise(uuid) from public;
grant execute on function public.create_shared_exercise(text, integer, jsonb) to authenticated;
grant execute on function public.read_shared_exercise(uuid) to anon, authenticated;
