import { gradeChoice, gradeOrder, type GrammarItem } from './grammarSet.ts';
import { weightedPercent } from './scoreboard.ts';
import { madridDayKey } from './tasks.ts';

export type ChallengeLevel = 'B1' | 'B2' | 'C1';
export type ChallengeKind = 'reading' | 'listening' | 'grammar';

export type ChallengeEntry = {
  alias: string;
  isSelf: boolean;
  demo: boolean;
  correct: number;
  total: number;
  seconds: number;
};

export type PresentedChallenge = ChallengeEntry & {
  rank: number;
  percent: number | null;
};

export type ChallengeQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export function challengeLevel(value: string | null | undefined): ChallengeLevel {
  const key = (value ?? '').trim().toLowerCase();
  if (key === 'b2' || key === 'intermediate') return 'B2';
  if (key === 'c1' || key === 'c2' || key === 'advanced') return 'C1';
  return 'B1';
}

/** Listening rows are stored as Beginner, Intermediate, and Advanced. */
export function listeningLevelForChallenge(level: ChallengeLevel): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (level === 'B2') return 'Intermediate';
  if (level === 'C1') return 'Advanced';
  return 'Beginner';
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remain = whole % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
}

export function elapsedSeconds(startedAt: string, submittedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(submittedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 1000);
}

export function todayMadrid(now = new Date()): string {
  return madridDayKey(now);
}

/** Higher combined percent first. A tie goes to the shorter time. */
export function presentChallenge(rows: readonly ChallengeEntry[]): {
  top: PresentedChallenge[];
  self: PresentedChallenge | null;
} {
  const ranked = rows
    .filter((row) => row.total > 0 && row.correct >= 0 && row.correct <= row.total)
    .map((row) => ({ ...row, rank: 0, percent: weightedPercent(row.correct, row.total) }));
  ranked.sort((left, right) => {
    const leftRatio = left.correct / left.total;
    const rightRatio = right.correct / right.total;
    if (rightRatio !== leftRatio) return rightRatio - leftRatio;
    if (left.seconds !== right.seconds) return left.seconds - right.seconds;
    return left.alias.localeCompare(right.alias) || Number(right.isSelf) - Number(left.isSelf);
  });
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  return {
    top: ranked.slice(0, 10),
    self: ranked.find((row) => row.isSelf && row.rank > 10) ?? null,
  };
}

export function gradeQuestions(questions: readonly { correctAnswer: string }[], answers: readonly string[]): number {
  return questions.reduce((sum, question, index) => (
    sum + (String(answers[index] ?? '').trim() === question.correctAnswer ? 1 : 0)
  ), 0);
}

export function gradeGrammarItems(items: readonly GrammarItem[], answers: readonly (string | string[])[]): number {
  return items.reduce((sum, item, index) => {
    const answer = answers[index];
    if (item.kind === 'order') {
      const chosen = Array.isArray(answer) ? answer.map((part) => String(part)) : [];
      return sum + (gradeOrder(item, chosen).correct ? 1 : 0);
    }
    const selected = Array.isArray(answer) ? String(answer[0] ?? '') : String(answer ?? '');
    return sum + (gradeChoice(item, selected).correct ? 1 : 0);
  }, 0);
}

export function challengeDedupeParts(kind: ChallengeKind, questions: readonly { question?: string; prompt?: string; correctAnswer: string }[]): string[] {
  return questions.map((item) => `${item.question ?? item.prompt ?? ''}\n${item.correctAnswer}`);
}
