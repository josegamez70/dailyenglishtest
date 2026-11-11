-- Diagnostics for the Monday exercise-bank refill.
-- One run row at start and at the end, and one attempt row per cell.
-- The browser cannot read these. The service role writes them.
-- This does not change exercise_bank, serves, storage, saved lessons, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.

create table if not exists public.exercise_bank_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  kind text not null,
  target integer not null default 0,
  cursor integer not null default 0,
  hops integer not null default 0,
  status text not null default 'started',
  stop_reason text not null default '',
  inserted integer not null default 0,
  remaining integer not null default 0,
  message text not null default '',
  constraint exercise_bank_runs_status_check check (status in ('started', 'finished', 'error'))
);

create table if not exists public.exercise_bank_attempts (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.exercise_bank_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  level text not null default '',
  format text not null default '',
  topic text not null default '',
  stage text not null default '',
  result text not null,
  problems text not null default '',
  duration_ms integer not null default 0,
  constraint exercise_bank_attempts_result_check check (result in ('ok', 'miss', 'error'))
);

create index if not exists exercise_bank_attempts_run_idx
  on public.exercise_bank_attempts (run_id, id);

alter table public.exercise_bank_runs enable row level security;
alter table public.exercise_bank_attempts enable row level security;

revoke all on public.exercise_bank_runs from public, anon, authenticated;
revoke all on public.exercise_bank_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.exercise_bank_runs to service_role;
grant select, insert, update, delete on public.exercise_bank_attempts to service_role;

drop policy if exists exercise_bank_runs_deny_clients on public.exercise_bank_runs;
create policy exercise_bank_runs_deny_clients on public.exercise_bank_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists exercise_bank_attempts_deny_clients on public.exercise_bank_attempts;
create policy exercise_bank_attempts_deny_clients on public.exercise_bank_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.exercise_bank_runs is
  'One row per exercise-bank refill invocation. Service role only. No lesson text and no answers.';

comment on table public.exercise_bank_attempts is
  'One row per refill attempt. problems is a short reason, not the lesson.';
