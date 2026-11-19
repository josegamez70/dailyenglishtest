-- Spanish lines for a saved vocabulary word.
-- A site deploy does not apply this. Run it in Supabase after it is approved.
-- Safe to run more than once.
-- Until this runs, the word list still opens. A Spanish view can be translated
-- in the session, and it is stored on the word once these columns exist.

alter table public.saved_vocabulary
  add column if not exists spanish_term text not null default '';

alter table public.saved_vocabulary
  add column if not exists spanish_meaning text not null default '';

alter table public.saved_vocabulary
  add column if not exists spanish_example text not null default '';
