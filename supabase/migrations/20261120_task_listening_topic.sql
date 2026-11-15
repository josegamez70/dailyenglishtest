-- Tasks can store a listening topic separately from the reading topic.
-- Existing rows keep the topic they already use for both exercises.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.
-- Until this runs, saving tasks still works and listening uses the reading topic.

alter table public.task_settings
  add column if not exists listening_topic text;

update public.task_settings
  set listening_topic = topic
  where listening_topic is null or btrim(listening_topic) = '';

alter table public.task_settings
  alter column listening_topic set default 'daily life';

alter table public.task_settings
  alter column listening_topic set not null;
