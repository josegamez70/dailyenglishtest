import { lessonModeLabel } from './progressStats';
import { savedLevelLabel } from './studentDetail';

export type SavedLessonBadge = {
  kind: 'mode' | 'format' | 'level';
  label: string;
};

/**
 * A saved lesson keeps the practice mode (`reading` or `listening`) and the
 * format (`text` or `dialogue`). My progress already prints that mode as
 * Reading or Audio. The lesson screen calls the two formats Text and Dialogue.
 */
export function savedLessonBadges(lesson: Record<string, unknown>): SavedLessonBadge[] {
  const badges: SavedLessonBadge[] = [];
  if (lesson.mode === 'reading' || lesson.mode === 'listening') {
    badges.push({ kind: 'mode', label: lessonModeLabel(lesson.mode) });
  }
  if (lesson.format === 'text') badges.push({ kind: 'format', label: 'Text' });
  else if (lesson.format === 'dialogue') badges.push({ kind: 'format', label: 'Dialogue' });
  const level = savedLessonLevelLabel(lesson);
  if (level) badges.push({ kind: 'level', label: level });
  return badges;
}

/** Prefer the label stored with the lesson. Otherwise the raw level value. */
export function savedLessonLevelLabel(lesson: Record<string, unknown>): string {
  const label = typeof lesson.levelLabel === 'string' ? lesson.levelLabel.trim() : '';
  const level = typeof lesson.level === 'string' ? lesson.level.trim() : '';
  const raw = label || level;
  if (!raw) return '';
  return savedLevelLabel(raw);
}
