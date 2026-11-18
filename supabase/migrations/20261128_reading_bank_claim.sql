-- Serves one unseen reading text. Does not change test_results or the live generator.
-- Practice skips the reading piece the daily challenge would use today and tomorrow
-- in Europe/Madrid, so opening a normal lesson does not use up that day's challenge.
-- The index is abs(first 8 hex digits of md5(day|level|reading) as a signed 32-bit int) mod count,
-- over active reading rows for that level ordered by content_hash.
-- A site deploy does not apply this. Run it in Supabase after it is approved.

create or replace function public.claim_reading_bank_item(
  uid uuid,
  reading_level text,
  reading_topic text
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
  if uid is null or reading_level not in ('B1', 'B2', 'C1') then
    return jsonb_build_object('status', 'empty');
  end if;

  select b.id, b.payload
    into chosen, body
  from public.exercise_bank b
  where b.kind = 'reading'
    and b.active
    and b.level = reading_level
    and (
      coalesce(reading_topic, '') = ''
      or b.dimensions->>'topic' = reading_topic
    )
    and not exists (
      select 1
      from public.exercise_bank_serves s
      where s.user_id = uid
        and s.exercise_id = b.id
    )
    and not exists (
      select 1
      from (
        select ((timezone('Europe/Madrid', now()))::date + offs.n)::text as day
        from (values (0), (1)) as offs(n)
      ) days
      join (
        select
          row.id,
          row_number() over (order by row.content_hash) - 1 as idx,
          count(*) over () as n
        from public.exercise_bank row
        where row.kind = 'reading'
          and row.active
          and row.level = reading_level
      ) pool
        on pool.idx = mod(
          abs(('x' || substr(md5(days.day || '|' || reading_level || '|reading'), 1, 8))::bit(32)::bigint),
          pool.n
        )
      where pool.id = b.id
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

revoke all on function public.claim_reading_bank_item(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_reading_bank_item(uuid, text, text) to service_role;
