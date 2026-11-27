-- Display names: strip characters that are not letters, numbers, spaces, or . _ - '
-- Then require that shape. Safe to run more than once.
-- Read-only count before this file was written: 37 profiles, 1 would change
-- (id 79c26574-42f2-4a1a-b001-b1d6ce5d29b6). Academies: 0 rows, 0 would change.
-- This does not rename a chosen account. A name that becomes empty falls back to Learner.

create or replace function public.sanitized_display_name(raw text)
returns text
language sql
immutable
as $fn$
  select case
    when btrim(coalesce(raw, '')) = '' then ''
    else coalesce(
      nullif(left(btrim(regexp_replace(raw, $re$[^[:alpha:][:digit:] ._'-]$re$, '', 'g')), 40), ''),
      'Learner'
    )
  end;
$fn$;

do $body$
declare
  changing integer;
begin
  select count(*) into changing
  from public.profiles
  where display_name is distinct from public.sanitized_display_name(display_name);
  raise notice 'display names to clean: %', changing;
end
$body$;

update public.profiles
set display_name = public.sanitized_display_name(display_name)
where display_name is distinct from public.sanitized_display_name(display_name);

update public.academies
set name = coalesce(
  nullif(left(btrim(regexp_replace(name, $re$[^[:alpha:][:digit:] ._'-]$re$, '', 'g')), 60), ''),
  'Academy'
)
where name !~ $re$^[[:alpha:][:digit:] ._'-]{1,60}$$re$;

alter table public.profiles drop constraint if exists profiles_display_name_chars;
alter table public.profiles add constraint profiles_display_name_chars
  check (display_name ~ $re$^[[:alpha:][:digit:] ._'-]{0,40}$$re$);

alter table public.academies drop constraint if exists academies_name_chars;
alter table public.academies add constraint academies_name_chars
  check (name ~ $re$^[[:alpha:][:digit:] ._'-]{1,60}$$re$);

create or replace function public.create_academy(academy_name text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  owner_plan text;
  seat_cap integer := 8;
  pilot_end timestamptz;
  clean_name text := btrim(coalesce(academy_name, ''));
  new_code text;
  attempt integer;
begin
  if uid is null then
    return 'auth_required';
  end if;
  if clean_name = '' or char_length(clean_name) > 60 then
    return 'name_required';
  end if;
  if clean_name !~ $re$^[[:alpha:][:digit:] ._'-]*$$re$ then
    return 'name_invalid';
  end if;
  select p.plan, p.academy_seat_limit, p.pilot_expires_at
    into owner_plan, seat_cap, pilot_end
  from public.profiles p
  where p.id = uid;
  if owner_plan is distinct from 'academy' then
    return 'not_academy_plan';
  end if;
  if pilot_end is not null and pilot_end <= now() then
    return 'academy_inactive';
  end if;
  if seat_cap is null or seat_cap not in (20, 40, 70, 100) then
    seat_cap := 8;
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_exists';
  end if;
  for attempt in 1..8 loop
    new_code := public.make_invite_code();
    begin
      insert into public.academies (owner_id, name, invite_code, max_students)
      values (uid, clean_name, new_code, seat_cap);
      return 'ok';
    exception when unique_violation then
      if exists (select 1 from public.academies where owner_id = uid) then
        return 'already_exists';
      end if;
    end;
  end loop;
  return 'code_unavailable';
end;
$fn$;
