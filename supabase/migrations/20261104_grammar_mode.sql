-- Allow grammar results beside reading and listening.
-- Safe to run more than once. Apply this on production before learners save a grammar score.

alter table public.test_results
  drop constraint if exists test_results_mode_check;

alter table public.test_results
  add constraint test_results_mode_check
  check (mode is null or mode in ('reading', 'listening', 'grammar'));
