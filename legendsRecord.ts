import { getSupabase } from './auth';
import { isValidScoredLesson, lessonDedupeKey, type LegendModality } from './legends';
import { enqueueLegendUnlocks } from './legendsToast';

/**
 * Records one finished, scored exercise. The daily challenge can call this once
 * for each of its three parts (reading, listening, grammar) with that part's content.
 * A missing database function does nothing, so the screen still works before the migration.
 */
export async function recordScoredLesson(
  modality: LegendModality,
  parts: readonly string[],
  score: number,
  total: number,
): Promise<void> {
  if (!isValidScoredLesson(score, total) || parts.length === 0) return;
  const supabase = getSupabase();
  if (!supabase) return;
  const dedupeKey = await lessonDedupeKey(modality, parts);
  const result = await supabase.rpc('record_lesson_completion', {
    p_modality: modality,
    p_key: dedupeKey,
    p_score: score,
    p_total: total,
  });
  if (result.error || !Array.isArray(result.data)) return;
  enqueueLegendUnlocks(result.data.filter((id): id is string => typeof id === 'string' && id.length > 0));
}
