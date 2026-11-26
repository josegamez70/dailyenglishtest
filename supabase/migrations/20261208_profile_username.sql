-- A unique public @. Existing rows stay null. Display names are not copied or changed.

alter table public.profiles add column if not exists handle text;

create unique index if not exists profiles_handle_lower_uidx
  on public.profiles (lower(handle))
  where handle is not null;

grant update (handle) on public.profiles to authenticated;

create or replace function public.claim_username(candidate text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text;
begin
  if auth.uid() is null then
    raise exception 'username_signin';
  end if;
  clean := btrim(coalesce(candidate, ''));
  if clean !~ '^[[:alnum:]_]{3,24}$' then
    raise exception 'username_format';
  end if;
  if exists (
    select 1
    from public.profiles
    where handle is not null
      and lower(handle) = lower(clean)
      and id <> auth.uid()
  ) then
    raise exception 'username_taken';
  end if;
  update public.profiles
  set handle = clean
  where id = auth.uid();
  return clean;
end;
$$;

revoke all on function public.claim_username(text) from public;
grant execute on function public.claim_username(text) to authenticated;
