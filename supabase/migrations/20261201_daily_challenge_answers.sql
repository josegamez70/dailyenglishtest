-- Keeps each learner's daily-challenge answers so the same report can be opened again that day.
-- Does not change scores already saved, test_results, lessons_used, or billing.
-- A site deploy does not apply this. Run it in Supabase after it is approved.

alter table public.daily_challenge_attempts
  add column if not exists answers jsonb;
