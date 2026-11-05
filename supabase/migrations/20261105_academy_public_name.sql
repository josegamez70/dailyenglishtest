-- The name people see for an academy is the owner's profile display name.
-- If that is empty, the academy record name is used.
-- Safe to run more than once.

create or replace function public.lookup_academy_name(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  found_name text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(a.name), ''), 'Academy')
    into found_name
  from public.academies a
  left join public.profiles p on p.id = a.owner_id
  where a.invite_code = upper(btrim(coalesce(code, '')));
  return found_name;
end;
$$;

create or replace function public.my_academy()
returns table (academy_id uuid, academy_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  return query
    select a.id,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(a.name), ''), 'Academy'),
      'owner'::text
    from public.academies a
    left join public.profiles p on p.id = a.owner_id
    where a.owner_id = uid;
  if found then
    return;
  end if;
  return query
    select a.id,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(a.name), ''), 'Academy'),
      'student'::text
    from public.academy_members m
    join public.academies a on a.id = m.academy_id
    left join public.profiles p on p.id = a.owner_id
    where m.user_id = uid;
end;
$$;
