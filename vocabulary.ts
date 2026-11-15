export type VocabSource = 'reading' | 'listening' | 'lookup' | '';

export type SavedWord = {
  id: string;
  term: string;
  meaning: string;
  example: string;
  sourceType: VocabSource;
  lessonTitle: string;
  topic: string;
  level: string;
  createdAt: string;
  correctCount: number;
  wrongCount: number;
};

export type VocabLessonContext = {
  signedIn: boolean;
  sourceType: 'reading' | 'listening' | 'lookup';
  lessonTitle: string;
  topic: string;
  level: string;
  story: string;
};

export type VocabQuizQuestion = {
  term: string;
  prompt: string;
  choices: string[];
  answer: string;
};

export const VOCAB_QUIZ_MIN = 4;
export const VOCAB_QUIZ_COUNT = 10;

let lessonContext: VocabLessonContext | null = null;
const contextListeners = new Set<() => void>();
let signInHandler: (() => void) | null = null;

export function setVocabLessonContext(next: VocabLessonContext | null) {
  lessonContext = next;
  contextListeners.forEach((listener) => listener());
}

export function getVocabLessonContext(): VocabLessonContext | null {
  return lessonContext;
}

export function subscribeVocabContext(listener: () => void) {
  contextListeners.add(listener);
  return () => contextListeners.delete(listener);
}

export function setVocabSignInHandler(handler: (() => void) | null) {
  signInHandler = handler;
}

export function requestVocabSignIn() {
  signInHandler?.();
}

export function normalizeTerm(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function termKey(raw: string): string {
  return normalizeTerm(raw).toLowerCase();
}

export function sourceLabel(source: VocabSource): string {
  if (source === 'listening') return 'Listening';
  if (source === 'lookup') return 'From popup';
  if (source === 'reading') return 'Reading';
  return 'Lesson';
}

/** A sentence from the lesson that contains the word, when one exists. */
export function sentenceWith(text: string, term: string): string {
  const key = termKey(term);
  if (!key) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const sentences = flat.split(/(?<=[.!?])\s+/);
  const found = sentences.find((sentence) => sentence.toLowerCase().includes(key));
  return (found ?? '').slice(0, 240);
}

export function filterVocabulary(items: readonly SavedWord[], query: string, source: 'all' | VocabSource): SavedWord[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (source !== 'all' && item.sourceType !== source) return false;
    if (!needle) return true;
    return [item.term, item.meaning, item.example, item.lessonTitle, item.topic, item.level]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });
}

function rollIndex(length: number, random: () => number): number {
  const roll = random();
  const safe = Number.isFinite(roll) ? roll : 0;
  return Math.min(length - 1, Math.max(0, Math.floor(safe * length)));
}

export function shuffleItems<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = rollIndex(index + 1, random);
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

/** Multiple choice from saved words only. Returns null until there are 4 words with a meaning. */
export function buildVocabQuiz(items: readonly SavedWord[], random: () => number = Math.random): VocabQuizQuestion[] | null {
  const usable = items.filter((item) => termKey(item.term) && item.meaning.trim());
  if (usable.length < VOCAB_QUIZ_MIN) return null;
  const chosen = shuffleItems(usable, random).slice(0, Math.min(VOCAB_QUIZ_COUNT, usable.length));
  return chosen.map((item, index) => {
    const askMeaning = index % 2 === 0;
    const answer = askMeaning ? item.meaning.trim() : item.term;
    const distractors = shuffleItems(usable.filter((other) => termKey(other.term) !== termKey(item.term)), random)
      .map((other) => (askMeaning ? other.meaning.trim() : other.term))
      .filter((value, valueIndex, list) => value && value.toLowerCase() !== answer.toLowerCase() && list.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === valueIndex)
      .slice(0, 3);
    return {
      term: item.term,
      prompt: askMeaning ? `What does “${item.term}” mean?` : `Which word means “${item.meaning.trim()}”?`,
      choices: shuffleItems([answer, ...distractors], random),
      answer,
    };
  });
}
