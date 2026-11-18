-- Records scoreboard emails so the same learner is not mailed twice for one Spain date.
-- Does not change test results. Nothing is sent until SCOREBOARD_EMAILS_ENABLED is true.
-- Clients cannot read this table. The service role bypasses row security.

alter table public.profiles
  add column if not exists scoreboard_email_opt_out boolean not null default false;

create table if not exists public.scoreboard_email_sends (
  user_id uuid not null references auth.users (id) on delete cascade,
  madrid_day text not null,
  board text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, madrid_day),
  constraint scoreboard_email_sends_board_check check (board in ('academy', 'individual')),
  constraint scoreboard_email_sends_day_check check (madrid_day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

create table if not exists public.scoreboard_email_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique
);

alter table public.scoreboard_email_sends enable row level security;
alter table public.scoreboard_email_tokens enable row level security;

revoke all on public.scoreboard_email_sends from public, anon, authenticated;
revoke all on public.scoreboard_email_tokens from public, anon, authenticated;
