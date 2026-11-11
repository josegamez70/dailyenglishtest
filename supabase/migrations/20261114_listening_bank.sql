-- Listening rows in the exercise bank, and a private bucket for the mp3.
-- Grammar rows, serves, saved lessons, consume_lesson, academies, and billing stay as they are.
-- The browser cannot read exercise_bank (the quiz answers live there) and cannot read the bucket.
-- The server uses the service role, returns one lesson after it is served, and signs the audio.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

alter table public.exercise_bank drop constraint if exists exercise_bank_listening_slot_check;
alter table public.exercise_bank add constraint exercise_bank_listening_slot_check check (
  kind <> 'listening'
  or (
    level in ('Beginner', 'Intermediate', 'Advanced')
    and exercise_type in ('text', 'dialogue')
    and payload->>'mode' = 'listening'
    and payload->>'level' = level
    and payload->>'format' = exercise_type
    and coalesce(payload->>'story', '') <> ''
    and coalesce(payload->>'topic', '') <> ''
    and dimensions->>'topic' in (
      'daily life',
      'fantasy',
      'school_college',
      'mystery',
      'adventure',
      'science',
      'economy_finance',
      'travel',
      'hobbies',
      'health_sports',
      'technology',
      'culture_food'
    )
    and dimensions->>'wordCount' in ('60', '100', '140')
    and dimensions->>'questionCount' in ('5', '8', '10')
    and coalesce(dimensions->>'audioPath', '') ~ '^listening/[0-9a-f]{64}\.mp3$'
    and case
      when jsonb_typeof(payload->'quiz') = 'array'
        then jsonb_array_length(payload->'quiz') = (dimensions->>'questionCount')::int
      else false
    end
    and case
      when exercise_type = 'dialogue'
        then jsonb_typeof(payload->'dialogue') = 'array'
          and jsonb_array_length(payload->'dialogue') >= 4
      else true
    end
  )
);

create index if not exists exercise_bank_listening_recent_idx
  on public.exercise_bank (level, exercise_type, created_at desc, id desc)
  where kind = 'listening';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listening-audio', 'listening-audio', false, 5242880, array['audio/mpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No select policy for anon or authenticated. The service role signs a URL after a serve.
-- A policy that is never true does not grant access. It documents that clients are not the reader.
drop policy if exists listening_audio_no_client on storage.objects;
create policy listening_audio_no_client on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'listening-audio' and false)
  with check (bucket_id = 'listening-audio' and false);

comment on column public.exercise_bank.dimensions is
  'Extra key for this kind. Grammar leaves it empty. A listening row stores topic, wordCount, questionCount, and audioPath. audioPath is an object in the private listening-audio bucket, not a URL.';

-- Picks one unseen listening lesson and records the serve. An empty topic means any list topic
-- for that level, format, length, and question count. Only the service role may call it.
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

comment on function public.claim_listening_bank_item(uuid, text, text, text, integer, integer) is
  'Service-role only. Claims one listening lesson this person has not been served. The payload includes the answers.';
