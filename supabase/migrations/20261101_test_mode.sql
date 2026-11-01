-- Lesson mode on a finished test. Null means the row was saved before this column existed.
-- Safe to run more than once.

alter table public.test_results
  add column if not exists mode text;

alter table public.test_results
  drop constraint if exists test_results_mode_check;

alter table public.test_results
  add constraint test_results_mode_check
  check (mode is null or mode in ('reading', 'listening'));
