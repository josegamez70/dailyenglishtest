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

export const CHALLENGE_PART_COUNT = 5;

export type ChallengeQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  supportingSentence?: string;
  why: string;
};

export type ChallengeReportItem = {
  part: 'reading' | 'listening' | 'grammar';
  question: string;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  why: string;
};

function flat(value: string): string {
  return value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

export function challengeWhy(item: { explanation?: string; supportingSentence?: string }): string {
  const explanation = (item.explanation ?? '').replace(/\s+/g, ' ').trim();
  if (explanation) return explanation;
  return (item.supportingSentence ?? '').replace(/\s+/g, ' ').trim();
}

export function storyParagraphs(story: string): string[] {
  return story.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Two paragraphs that contain five questions, or null when this piece cannot. */
export function readingChallengeSlice<T extends { supportingSentence?: string }>(
  story: string,
  quiz: readonly T[],
): { story: string; quiz: T[] } | null {
  const paragraphs = storyParagraphs(story);
  if (paragraphs.length < 2 || quiz.length < CHALLENGE_PART_COUNT) return null;
  const located = quiz.flatMap((question, index) => {
    const needle = flat(question.supportingSentence ?? '');
    if (!needle) return [];
    const paragraph = paragraphs.findIndex((part) => flat(part).includes(needle));
    return paragraph < 0 ? [] : [{ question, index, paragraph }];
  });
  if (located.length < CHALLENGE_PART_COUNT) return null;
  for (let first = 0; first < paragraphs.length; first += 1) {
    for (let second = first + 1; second < paragraphs.length; second += 1) {
      const chosen = new Set([first, second]);
      const covered = located.filter((item) => chosen.has(item.paragraph));
      if (covered.length < CHALLENGE_PART_COUNT) continue;
      return {
        story: [paragraphs[first], paragraphs[second]].join('\n\n'),
        quiz: covered.slice(0, CHALLENGE_PART_COUNT).map((item) => item.question),
      };
    }
  }
  return null;
}

export type ChallengeVocabWord = {
  term: string;
  meaning: string;
  sourceType: 'reading' | 'listening';
  example: string;
};

function wordAppears(text: string, word: string): boolean {
  const needle = word.trim().toLowerCase();
  if (needle.length < 2) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
}

function sentenceWithWord(text: string, word: string): string {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
  const found = parts.find((part) => wordAppears(part, word));
  return (found ?? '').trim().slice(0, 240);
}

/** Stored word list entries that actually occur in the text served today. */
export function challengeVocabulary(input: {
  readingStory: string;
  readingVocabulary: readonly { word: string; definition: string }[];
  listeningText: string;
  listeningVocabulary: readonly { word: string; definition: string }[];
}): ChallengeVocabWord[] {
  const words: ChallengeVocabWord[] = [];
  const seen = new Set<string>();
  const add = (
    items: readonly { word: string; definition: string }[],
    text: string,
    sourceType: 'reading' | 'listening',
  ) => {
    for (const item of items) {
      const term = item.word.replace(/\s+/g, ' ').trim();
      const meaning = item.definition.replace(/\s+/g, ' ').trim();
      const key = term.toLowerCase();
      if (!term || !meaning || seen.has(key) || !wordAppears(text, term)) continue;
      seen.add(key);
      words.push({ term, meaning, sourceType, example: sentenceWithWord(text, term) });
    }
  };
  add(input.readingVocabulary, input.readingStory, 'reading');
  add(input.listeningVocabulary, input.listeningText, 'listening');
  return words;
}

/** The first five items, in the stored order. Fewer than five cannot be today's part. */
export function firstChallengeItems<T>(items: readonly T[]): T[] | null {
  if (items.length < CHALLENGE_PART_COUNT) return null;
  return items.slice(0, CHALLENGE_PART_COUNT);
}

export function buildChallengeReport(input: {
  reading: readonly { question: string; correctAnswer: string; why?: string; explanation?: string; supportingSentence?: string }[];
  listening: readonly { question: string; correctAnswer: string; why?: string; explanation?: string; supportingSentence?: string }[];
  grammar: readonly GrammarItem[];
  readingAnswers: readonly string[];
  listeningAnswers: readonly string[];
  grammarAnswers: readonly (string | string[])[];
}): ChallengeReportItem[] {
  const rows: ChallengeReportItem[] = [];
  input.reading.forEach((item, index) => {
    const userAnswer = String(input.readingAnswers[index] ?? '').trim();
    rows.push({
      part: 'reading',
      question: item.question,
      userAnswer: userAnswer || '—',
      correctAnswer: item.correctAnswer,
      correct: userAnswer === item.correctAnswer,
      why: item.why || challengeWhy(item),
    });
  });
  input.listening.forEach((item, index) => {
    const userAnswer = String(input.listeningAnswers[index] ?? '').trim();
    rows.push({
      part: 'listening',
      question: item.question,
      userAnswer: userAnswer || '—',
      correctAnswer: item.correctAnswer,
      correct: userAnswer === item.correctAnswer,
      why: item.why || challengeWhy(item),
    });
  });
  input.grammar.forEach((item, index) => {
    const answer = input.grammarAnswers[index];
    const userAnswer = item.kind === 'order'
      ? (Array.isArray(answer) ? answer.map((part) => String(part)).join(' ') : '')
      : (Array.isArray(answer) ? String(answer[0] ?? '') : String(answer ?? '')).trim();
    const correctAnswer = item.kind === 'order' ? item.chunks.join(' ') : item.correctAnswer;
    const correct = item.kind === 'order'
      ? gradeOrder(item, Array.isArray(answer) ? answer.map((part) => String(part)) : []).correct
      : gradeChoice(item, Array.isArray(answer) ? String(answer[0] ?? '') : String(answer ?? '')).correct;
    rows.push({
      part: 'grammar',
      question: item.prompt,
      userAnswer: userAnswer || '—',
      correctAnswer,
      correct,
      why: challengeWhy(item),
    });
  });
  return rows;
}

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

/** The signed-in learner's place, including first through tenth. */
export function challengeRank(rows: readonly ChallengeEntry[]): number | null {
  const board = presentChallenge(rows);
  return board.top.find((row) => row.isSelf)?.rank ?? board.self?.rank ?? null;
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
