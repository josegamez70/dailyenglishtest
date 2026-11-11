-- Lets the refill record a Gemini rate-limit wait without calling it a failed lesson.
-- Does not change exercise_bank, serves, storage, or billing.
-- A site deploy does not apply this. Run it after 20261116_exercise_bank_runs.sql.
-- Safe to run more than once.

alter table public.exercise_bank_attempts drop constraint if exists exercise_bank_attempts_result_check;
alter table public.exercise_bank_attempts add constraint exercise_bank_attempts_result_check
  check (result in ('ok', 'miss', 'error', 'rate_limited'));
