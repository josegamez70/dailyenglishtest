-- Optional My vocabulary activity on a task pack.
-- Empty vocabulary_mode keeps today's packs as reading, listening, and grammar only.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.
-- Until this runs, the choice is kept on this device and the other task settings still save.

alter table public.task_settings
  add column if not exists vocabulary_mode text not null default '';

alter table public.task_settings
  drop constraint if exists task_settings_vocabulary_mode_check;

alter table public.task_settings
  add constraint task_settings_vocabulary_mode_check
  check (vocabulary_mode in ('', 'flashcards', 'quiz'));

alter table public.task_packs
  add column if not exists vocabulary_done boolean not null default false;

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
    if old.vocabulary_done then new.vocabulary_done := true; end if;
    -- The pack is stored as complete when the three exercises are done.
    -- My vocabulary is extra. It does not hold back the reminder or this timestamp.
    if new.reading_done and new.listening_done and new.grammar_done and old.completed_at is null then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  end if;
  return new;
end;
$$;
