import { getSupabase } from './auth';
import { profileHandle } from './profileHandle';
import { decodeShare, publicLesson, type ShareCard } from './shareChallenge';

const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Store the exercise and return /s/<id>. The hash link remains if the table is missing. */
export async function publishShareLink(link: { line: string; url: string }): Promise<{ line: string; url: string }> {
  const token = link.url.split('#')[1] ?? '';
  const card = decodeShare(token);
  const supabase = getSupabase();
  if (!card || !supabase) return link;
  const { data, error } = await supabase.rpc('create_shared_exercise', {
    p_handle: card.handle.replace(/^@/, ''),
    p_score: card.percent,
    p_payload: card,
  });
  if (error || typeof data !== 'string' || !SHARE_ID.test(data)) return link;
  const base = link.url.slice(0, link.url.indexOf('/share#'));
  return { line: link.line, url: `${base}/s/${data}` };
}

export async function loadSharedExercise(id: string): Promise<ShareCard | null> {
  if (!SHARE_ID.test(id)) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('read_shared_exercise', { p_id: id });
  if (error || !data || typeof data !== 'object') return null;
  const payload = (data as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as ShareCard;
  if (raw.v !== 1) return null;
  const lesson = publicLesson(raw.mode, raw.lesson);
  if (!lesson) return null;
  return { ...raw, handle: profileHandle(String(raw.handle ?? '')), lesson };
}
