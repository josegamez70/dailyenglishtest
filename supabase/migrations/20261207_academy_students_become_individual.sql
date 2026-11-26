-- DET-30. A deploy does not apply this file. Do not run it until it is published on purpose.
-- It does not change Stripe, Gemini, profiles, results, vocabulary, badges, academies, or owner accounts.
--
-- A student link is an academy_members row whose user is not that academy's owner.
-- Those rows are copied into det30_student_link_backup, then deleted.
-- The same user_id keeps test_results, saved_lessons, saved_grammar, saved_vocabulary,
-- user_achievements, lesson_completions, task_packs, task_settings, and daily_challenge_attempts.
--
-- After this runs, those users are individual on the scoreboard: they are not academy members
-- and they do not own an academy. The teacher panel, Tasks, and each academy scoreboard stay.
-- Academies that have students today will list no students until someone is linked again.
--
-- Rollback, run by hand:
--   insert into public.academy_members (academy_id, user_id, joined_at)
--   select academy_id, user_id, joined_at
--   from public.det30_student_link_backup
--   on conflict (academy_id, user_id) do nothing;

create table if not exists public.det30_student_link_backup (
  academy_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null,
  backed_up_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);

alter table public.det30_student_link_backup enable row level security;
revoke all on table public.det30_student_link_backup from public, anon, authenticated;

insert into public.det30_student_link_backup (academy_id, user_id, joined_at)
select m.academy_id, m.user_id, m.joined_at
from public.academy_members m
join public.academies a on a.id = m.academy_id
where m.user_id <> a.owner_id
on conflict (academy_id, user_id) do nothing;

delete from public.academy_members m
using public.academies a
where m.academy_id = a.id
  and m.user_id <> a.owner_id;
