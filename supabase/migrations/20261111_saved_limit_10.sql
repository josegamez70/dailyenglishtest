-- Raise the saved-item caps from 5 to 10.
-- saved_lessons keeps the newest 10 reading and listening rows per user.
-- saved_grammar keeps the newest 10 grammar sets per user.
-- This replaces the two trigger functions only. It does not delete existing rows,
-- change table shape, row level security, academies, test results, or billing.
-- The new cap runs the next time that user saves an item.
-- Safe to run more than once. A site deploy does not apply this. Run it in Supabase.
-- Requires the saved_lessons and saved_grammar tables from earlier migrations.

create or replace function public.keep_latest_saved_lessons()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.saved_lessons
  where user_id = new.user_id
    and id not in (
      select id from public.saved_lessons
      where user_id = new.user_id
      order by created_at desc
      limit 10
    );
  return new;
end;
$$;

create or replace function public.keep_latest_saved_grammar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.saved_grammar
  where user_id = new.user_id
    and id not in (
      select id from public.saved_grammar
      where user_id = new.user_id
      order by created_at desc
      limit 10
    );
  return new;
end;
$$;
