-- Academies. Safe to run more than once. Run after 20261031_progress.sql.
-- The site owner sets plan = 'academy' by hand. There is no payment step here.
-- Free accounts still stop at the free limit. Tester and other paid plans stay unlimited.
-- A student of an academy whose owner has plan 'academy' is also unlimited.

create table if not exists public.academies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  max_students integer not null default 8,
  created_at timestamptz not null default now(),
  constraint academies_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint academies_max_students_pos check (max_students > 0)
);

create table if not exists public.academy_members (
  academy_id uuid not null references public.academies (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);

create index if not exists academy_members_academy_id_idx
  on public.academy_members (academy_id);

alter table public.academies enable row level security;
alter table public.academy_members enable row level security;

revoke all on public.academies from public, anon, authenticated;
revoke all on public.academy_members from public, anon, authenticated;
grant select on public.academies to authenticated;
grant select on public.academy_members to authenticated;

drop policy if exists academies_owner_read on public.academies;
create policy academies_owner_read on public.academies
  for select
  using (owner_id = auth.uid());

drop policy if exists academy_members_read on public.academy_members;
create policy academy_members_read on public.academy_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.academies a
      where a.id = academy_members.academy_id
        and a.owner_id = auth.uid()
    )
  );

-- Owners can read test results of their students. Saved lessons stay private.
drop policy if exists test_results_academy_read on public.test_results;
create policy test_results_academy_read on public.test_results
  for select
  using (
    exists (
      select 1
      from public.academy_members m
      join public.academies a on a.id = m.academy_id
      where m.user_id = test_results.user_id
        and a.owner_id = auth.uid()
    )
  );

-- Owners can read a student's profile row. The app asks only for email and display name.
drop policy if exists profiles_academy_read on public.profiles;
create policy profiles_academy_read on public.profiles
  for select
  using (
    exists (
      select 1
      from public.academy_members m
      join public.academies a on a.id = m.academy_id
      where m.user_id = profiles.id
        and a.owner_id = auth.uid()
    )
  );

create or replace function public.make_invite_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return code;
end;
$$;

revoke all on function public.make_invite_code() from public, anon, authenticated;

create or replace function public.academy_lesson_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academy_members m
    join public.academies a on a.id = m.academy_id
    join public.profiles owner_profile on owner_profile.id = a.owner_id
    where m.user_id = uid
      and owner_profile.plan = 'academy'
  );
$$;

revoke all on function public.academy_lesson_access(uuid) from public, anon, authenticated;
grant execute on function public.academy_lesson_access(uuid) to service_role;

create or replace function public.consume_lesson(uid uuid, free_limit integer default 3)
returns table (allowed boolean, lessons_used integer, plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  current_used integer;
begin
  select p.plan, p.lessons_used
    into current_plan, current_used
  from public.profiles p
  where p.id = uid
  for update;

  if not found then
    return query select false, 0, 'free'::text;
    return;
  end if;

  if current_plan is distinct from 'free' or public.academy_lesson_access(uid) then
    return query select true, current_used, current_plan;
    return;
  end if;

  if current_used >= free_limit then
    return query select false, current_used, current_plan;
    return;
  end if;

  update public.profiles
  set lessons_used = profiles.lessons_used + 1
  where id = uid
  returning profiles.lessons_used, profiles.plan
  into current_used, current_plan;

  return query select true, current_used, current_plan;
end;
$$;

revoke all on function public.consume_lesson(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_lesson(uuid, integer) to service_role;

create or replace function public.create_academy(academy_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_plan text;
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
  select p.plan into owner_plan from public.profiles p where p.id = uid;
  if owner_plan is distinct from 'academy' then
    return 'not_academy_plan';
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_exists';
  end if;
  for attempt in 1..8 loop
    new_code := public.make_invite_code();
    begin
      insert into public.academies (owner_id, name, invite_code)
      values (uid, clean_name, new_code);
      return 'ok';
    exception when unique_violation then
      if exists (select 1 from public.academies where owner_id = uid) then
        return 'already_exists';
      end if;
    end;
  end loop;
  return 'code_unavailable';
end;
$$;

create or replace function public.regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  academy_id uuid;
  new_code text;
  attempt integer;
begin
  if uid is null then
    return 'auth_required';
  end if;
  select a.id into academy_id
  from public.academies a
  where a.owner_id = uid
  for update;
  if not found then
    return 'not_owner';
  end if;
  for attempt in 1..8 loop
    new_code := public.make_invite_code();
    begin
      update public.academies
      set invite_code = new_code
      where id = academy_id;
      return new_code;
    exception when unique_violation then
      null;
    end;
  end loop;
  return 'code_unavailable';
end;
$$;

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
  select a.name into found_name
  from public.academies a
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
    select a.id, a.name, 'owner'::text
    from public.academies a
    where a.owner_id = uid;
  if found then
    return;
  end if;
  return query
    select a.id, a.name, 'student'::text
    from public.academy_members m
    join public.academies a on a.id = m.academy_id
    where m.user_id = uid;
end;
$$;

create or replace function public.join_academy(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := upper(btrim(coalesce(code, '')));
  academy public.academies%rowtype;
  member_count integer;
begin
  if uid is null then
    return 'auth_required';
  end if;
  if exists (select 1 from public.academies where owner_id = uid) then
    return 'already_member';
  end if;
  if exists (select 1 from public.academy_members where user_id = uid) then
    return 'already_member';
  end if;
  select * into academy
  from public.academies
  where invite_code = clean
  for update;
  if not found then
    return 'invalid_code';
  end if;
  select count(*)::integer into member_count
  from public.academy_members
  where academy_id = academy.id;
  if member_count >= academy.max_students then
    return 'academy_full';
  end if;
  insert into public.academy_members (academy_id, user_id)
  values (academy.id, uid);
  return 'ok';
exception when unique_violation then
  return 'already_member';
end;
$$;

create or replace function public.leave_academy()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return 'auth_required';
  end if;
  delete from public.academy_members where user_id = uid;
  if not found then
    return 'not_member';
  end if;
  return 'ok';
end;
$$;

create or replace function public.remove_student(user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return 'auth_required';
  end if;
  if not exists (select 1 from public.academies where owner_id = uid) then
    return 'not_owner';
  end if;
  delete from public.academy_members m
  using public.academies a
  where m.user_id = remove_student.user_id
    and m.academy_id = a.id
    and a.owner_id = uid;
  if not found then
    return 'not_member';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.create_academy(text) from public, anon, authenticated;
revoke all on function public.regenerate_invite_code() from public, anon, authenticated;
revoke all on function public.lookup_academy_name(text) from public, anon, authenticated;
revoke all on function public.my_academy() from public, anon, authenticated;
revoke all on function public.join_academy(text) from public, anon, authenticated;
revoke all on function public.leave_academy() from public, anon, authenticated;
revoke all on function public.remove_student(uuid) from public, anon, authenticated;

grant execute on function public.create_academy(text) to authenticated;
grant execute on function public.regenerate_invite_code() to authenticated;
grant execute on function public.lookup_academy_name(text) to authenticated;
grant execute on function public.my_academy() to authenticated;
grant execute on function public.join_academy(text) to authenticated;
grant execute on function public.leave_academy() to authenticated;
grant execute on function public.remove_student(uuid) to authenticated;
