import { emptyBadgeStats, type BadgeStats } from './badges.ts';
import { madridDayKey } from './tasks.ts';
import { listTestResults } from './studyStore.ts';
import { getVocabularyState, loadVocabulary } from './vocabularyStore.ts';

export async function loadBadgeStats(): Promise<BadgeStats> {
  const [results] = await Promise.all([
    listTestResults(),
    loadVocabulary().catch(() => undefined),
  ]);
  const stats = emptyBadgeStats();
  for (const row of results.rows) {
    if (row.total <= 0) continue;
    if (row.mode !== 'reading' && row.mode !== 'listening' && row.mode !== 'grammar') continue;
    stats[row.mode] += 1;
    if (row.score >= row.total) stats.perfect += 1;
    const day = madridDayKey(new Date(row.created_at));
    if (!stats.days.includes(day)) stats.days.push(day);
  }
  stats.vocabAnswers = getVocabularyState().rows.reduce(
    (sum, row) => sum + Math.max(0, row.correctCount) + Math.max(0, row.wrongCount),
    0,
  );
  return stats;
}
