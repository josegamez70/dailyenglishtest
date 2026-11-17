-- Profile levels are B1, B2, and C1. A1 and A2 become B1. C2 becomes C1.
-- New accounts start at B1. New task settings leave email reminders off.
-- welcome_seen remembers that the short first-run guide was finished or skipped.
-- Existing reminder choices are left as they are.

update public.profiles
set default_level = 'B1'
where default_level in ('A1', 'A2', 'a1', 'a2');

update public.profiles
set default_level = 'C1'
where default_level in ('C2', 'c2');

alter table public.profiles alter column default_level set default 'B1';

alter table public.profiles add column if not exists welcome_seen boolean not null default false;

alter table public.task_settings alter column email_reminders set default false;
