-- How many packs a daily schedule issues, and keep the last 5 days instead of the last 5 packs.
-- A weekly schedule still issues one pack. Existing rows stay at 1 pack per day, slot 1.
-- This does not change saved lessons, the 3 free lessons, consume_lesson, academies, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

alter table public.task_settings
  add column if not exists packs_per_day integer not null default 1;

alter table public.task_settings
  drop constraint if exists task_settings_packs_per_day_check;

alter table public.task_settings
  add constraint task_settings_packs_per_day_check check (packs_per_day in (1, 2, 3));

alter table public.task_packs
  add column if not exists pack_slot integer not null default 1;

alter table public.task_packs
  drop constraint if exists task_packs_pack_slot_check;

alter table public.task_packs
  add constraint task_packs_pack_slot_check check (pack_slot between 1 and 3);

alter table public.task_packs drop constraint if exists task_packs_user_id_period_key_key;

alter table public.task_packs drop constraint if exists task_packs_user_period_slot_key;

alter table public.task_packs
  add constraint task_packs_user_period_slot_key unique (user_id, period_key, pack_slot);

create or replace function public.protect_task_pack()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.period_key := old.period_key;
    new.pack_slot := old.pack_slot;
    new.frequency := old.frequency;
    new.status := old.status;
    new.charged := old.charged;
    new.emailed_at := old.emailed_at;
    new.block_reason := old.block_reason;
    new.locked_until := old.locked_until;
    if old.reading_done then new.reading_done := true; end if;
    if old.listening_done then new.listening_done := true; end if;
    if old.grammar_done then new.grammar_done := true; end if;
    if new.reading_done and new.listening_done and new.grammar_done and old.completed_at is null then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.keep_latest_task_packs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.task_packs
  where user_id = new.user_id
    and (timezone('Europe/Madrid', created_at))::date not in (
      select day
      from (
        select (timezone('Europe/Madrid', created_at))::date as day
        from public.task_packs
        where user_id = new.user_id
        group by 1
        order by 1 desc
        limit 5
      ) recent
    );
  return new;
end;
$$;
