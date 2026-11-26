-- Sender result on a shared exercise. Existing rows stay null and old links still open.

alter table public.shared_exercises add column if not exists sender_correct integer;
alter table public.shared_exercises add column if not exists sender_total integer;
alter table public.shared_exercises add column if not exists sender_seconds integer;

alter table public.shared_exercises drop constraint if exists shared_exercises_sender_result_check;
alter table public.shared_exercises add constraint shared_exercises_sender_result_check check (
  (sender_correct is null and sender_total is null)
  or (
    sender_correct is not null
    and sender_total is not null
    and sender_total > 0
    and sender_correct >= 0
    and sender_correct <= sender_total
    and (sender_seconds is null or sender_seconds >= 0)
  )
);

drop function if exists public.create_shared_exercise(text, integer, jsonb);

create or replace function public.create_shared_exercise(
  p_handle text,
  p_score integer,
  p_payload jsonb,
  p_sender_correct integer default null,
  p_sender_total integer default null,
  p_sender_seconds integer default null
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
  if p_sender_total is not null and (
    p_sender_correct is null
    or p_sender_total <= 0
    or p_sender_correct < 0
    or p_sender_correct > p_sender_total
    or (p_sender_seconds is not null and p_sender_seconds < 0)
  ) then
    raise exception 'share_sender';
  end if;
  clean := left(btrim(coalesce(p_handle, '')), 24);
  insert into public.shared_exercises (
    sender_id, handle, score, payload, sender_correct, sender_total, sender_seconds
  )
  values (
    auth.uid(), clean, p_score, p_payload, p_sender_correct, p_sender_total, p_sender_seconds
  )
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
    'sender_correct', sender_correct,
    'sender_total', sender_total,
    'sender_seconds', sender_seconds,
    'payload', payload
  )
  from public.shared_exercises
  where id = p_id;
$$;

revoke all on function public.create_shared_exercise(text, integer, jsonb, integer, integer, integer) from public;
grant execute on function public.create_shared_exercise(text, integer, jsonb, integer, integer, integer) to authenticated;
