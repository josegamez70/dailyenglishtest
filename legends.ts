export type LegendModality = 'reading' | 'listening' | 'grammar' | 'vocabulary';

export type LegendCounts = Record<LegendModality, number>;

export type LegendBadge = {
  id: string;
  name: string;
  need: number;
  icon: string;
  unlocked: boolean;
};

export const LEGEND_MODALITIES: LegendModality[] = ['reading', 'listening', 'grammar', 'vocabulary'];

export const GLOBAL_LEGENDS = [
  { id: 'rookie', name: 'Rookie', need: 5, icon: '/achievements/rookie_floppy.png' },
  { id: 'first_steps', name: 'First Steps', need: 10, icon: '/achievements/first_steps_cassette.png' },
  { id: 'retro_player', name: 'Retro Player', need: 25, icon: '/achievements/retro_player_walkman.png' },
  { id: 'arcade_starter', name: 'Arcade Starter', need: 50, icon: '/achievements/arcade_starter_joystick.png' },
  { id: 'century_club', name: 'Century Club', need: 100, icon: '/achievements/century_club_bmx.png' },
  { id: 'power_user', name: 'Power User', need: 250, icon: '/achievements/power_user_gameboy.png' },
  { id: 'english_master', name: 'English Master', need: 500, icon: '/achievements/english_master_486.png' },
  { id: 'retro_legend', name: 'Retro Legend', need: 1000, icon: '/achievements/retro_legend_arcade.png' },
  { id: 'hall_of_fame', name: 'Hall of Fame', need: 2500, icon: '/achievements/hall_of_fame_gold_cd.png' },
  { id: 'ultimate_legend', name: 'Ultimate Legend', need: 5000, icon: '/achievements/ultimate_legend_trophy.png' },
] as const;

export const MODALITY_NEEDS = [10, 50, 100, 500] as const;

const MODALITY_ICON = {
  reading: 'reading',
  listening: 'listening',
  grammar: 'grammar',
  vocabulary: 'vocabulary',
} as const;

export function emptyLegendCounts(): LegendCounts {
  return { reading: 0, listening: 0, grammar: 0, vocabulary: 0 };
}

export function legendTotal(counts: LegendCounts): number {
  return counts.reading + counts.listening + counts.grammar + counts.vocabulary;
}

export function modalityBadgeId(modality: LegendModality, need: number): string {
  return `${modality}_${need}`;
}

export function earnedIds(counts: LegendCounts): string[] {
  const total = legendTotal(counts);
  const ids = GLOBAL_LEGENDS.filter((item) => total >= item.need).map((item) => item.id);
  for (const modality of LEGEND_MODALITIES) {
    for (const need of MODALITY_NEEDS) {
      if (counts[modality] >= need) ids.push(modalityBadgeId(modality, need));
    }
  }
  return ids;
}

export function globalBadges(counts: LegendCounts, unlocked: readonly string[]): LegendBadge[] {
  const have = new Set(unlocked);
  const total = legendTotal(counts);
  return GLOBAL_LEGENDS.map((item) => ({
    ...item,
    unlocked: have.has(item.id) || total >= item.need,
  }));
}

export function modalityBadges(modality: LegendModality, counts: LegendCounts, unlocked: readonly string[]): LegendBadge[] {
  const have = new Set(unlocked);
  const label = modality[0].toUpperCase() + modality.slice(1);
  return MODALITY_NEEDS.map((need) => {
    const id = modalityBadgeId(modality, need);
    return {
      id,
      name: `${label} ${need}`,
      need,
      icon: `/achievements/${MODALITY_ICON[modality]}_${need}.png`,
      unlocked: have.has(id) || counts[modality] >= need,
    };
  });
}

export function nextGoal(count: number, needs: readonly number[]): { need: number; current: number } | null {
  const need = needs.find((item) => count < item);
  if (need == null) return null;
  return { need, current: count };
}

export type LegendMailStanding = {
  lessons: number;
  badge: { id: string; name: string; icon: string } | null;
  nextLine: string;
};

/** Highest global Retro Legend already earned, and the lessons still needed for the next one. */
export function legendMailStanding(lessons: number, unlocked: readonly string[]): LegendMailStanding {
  const count = Number.isFinite(lessons) && lessons > 0 ? Math.floor(lessons) : 0;
  const have = new Set(unlocked);
  let badgeIndex = -1;
  GLOBAL_LEGENDS.forEach((item, index) => {
    if (count >= item.need || have.has(item.id)) badgeIndex = index;
  });
  const badge = badgeIndex >= 0 ? GLOBAL_LEGENDS[badgeIndex] : null;
  const next = GLOBAL_LEGENDS.find((item, index) => index > badgeIndex && count < item.need);
  const remaining = next ? next.need - count : 0;
  const nextLine = next
    ? `${remaining} more ${remaining === 1 ? 'lesson' : 'lessons'} to ${next.name}`
    : 'Every Retro Legend is earned.';
  return {
    lessons: count,
    badge: badge ? { id: badge.id, name: badge.name, icon: badge.icon } : null,
    nextLine,
  };
}

/** Stable key for one finished exercise. A repeat of the same content does not count again. */
export async function lessonDedupeKey(modality: LegendModality, parts: readonly string[]): Promise<string> {
  const text = [modality, ...[...parts].map((part) => part.trim()).sort()].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isValidScoredLesson(score: number, total: number): boolean {
  return Number.isInteger(score) && Number.isInteger(total) && total > 0 && score >= 0 && score <= total;
}
