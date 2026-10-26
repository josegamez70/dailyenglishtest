/** Shared lesson checks used by the server and the browser. */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'and', 'or', 'in', 'on', 'at', 'for', 'with',
  'from', 'by', 'is', 'was', 'were', 'be', 'it', 'that', 'this', 'as', 'but',
  'his', 'her', 'their', 'they', 'she', 'he', 'you', 'your', 'its', 'into',
  'about', 'after', 'before', 'than', 'then', 'so', 'if', 'not', 'are', 'been',
  'had', 'have', 'has', 'who', 'what', 'when', 'where', 'which', 'there',
]);

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Inclusive word-count window of about ±15% around the requested length. */
export function wordCountBounds(target: number): { min: number; max: number } {
  const safe = Math.max(1, Math.round(target));
  return {
    min: Math.floor(safe * 0.85),
    max: Math.ceil(safe * 1.15),
  };
}

export function isWordCountWithinTolerance(text: string, target: number): boolean {
  const count = countWords(text);
  const { min, max } = wordCountBounds(target);
  return count >= min && count <= max;
}

/** Rough wait for the loading screen. A 200-word, 10-question lesson is about half a minute. */
export function estimateGenerationSeconds(wordCount: number, questionCount: number): number {
  const seconds = 8 + wordCount * 0.05 + questionCount * 1.3;
  return Math.round(Math.min(40, Math.max(12, seconds)));
}

export function scoreFeedback(percentage: number): string {
  if (percentage >= 90) return 'Excellent! You understood this story very well.';
  if (percentage >= 70) return 'Well done! You understood most of the story.';
  if (percentage >= 40) return 'Good effort! You are getting there.';
  return 'Keep practicing! Every story helps you improve.';
}

/** Whole seconds since a request started. Uses the clock, not a tick counter. */
export function elapsedWholeSeconds(startedAt: number, now: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export type QuestionSkill = 'detail' | 'inference' | 'vocabulary' | 'intent';

export function normalizeQuestionSkill(value: unknown): QuestionSkill | null {
  const text = String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (text === 'detail' || text === 'literal' || text === 'recall' || text === 'fact') return 'detail';
  if (text === 'inference' || text === 'infer') return 'inference';
  if (text === 'vocabulary' || text === 'vocab' || text === 'vocabulary in context') return 'vocabulary';
  if (text === 'intent' || text === 'author intent' || text === 'purpose' || text === 'author purpose') return 'intent';
  return null;
}

/** True when most questions are inference, vocabulary-in-context, or author intent. */
export function advancedSkillsAreChallenging(skills: Array<QuestionSkill | null>): boolean {
  if (skills.length === 0) return false;
  const challenging = skills.filter((skill) => skill === 'inference' || skill === 'vocabulary' || skill === 'intent').length;
  return challenging / skills.length > 0.5;
}

/** The question repeats the correct answer, as in a circular "artificial intelligence" item. */
export function questionGivesAwayAnswer(question: string, correctAnswer: string): boolean {
  const answerWords = contentWords(correctAnswer);
  if (answerWords.length === 0) return false;
  const questionWords = new Set(contentWords(question));
  const overlap = answerWords.filter((word) => questionWords.has(word)).length;
  if (answerWords.length === 1) return questionWords.has(answerWords[0]);
  return overlap / answerWords.length >= 0.6;
}

const SYNONYM_GROUPS = [
  ['fair', 'fairly', 'equitable', 'equitably', 'equally', 'justly', 'impartial', 'impartially'],
  ['happy', 'glad', 'pleased', 'joyful', 'delighted'],
  ['sad', 'unhappy', 'upset', 'miserable'],
  ['big', 'large', 'huge', 'enormous'],
  ['small', 'little', 'tiny'],
  ['smart', 'clever', 'intelligent', 'bright'],
  ['angry', 'mad', 'furious'],
  ['quick', 'quickly', 'fast', 'rapid', 'rapidly'],
  ['help', 'assist', 'aid'],
  ['buy', 'purchase'],
  ['start', 'begin', 'commence'],
  ['end', 'finish', 'conclude'],
];

function synonymGroup(word: string): number {
  return SYNONYM_GROUPS.findIndex((group) => group.includes(word));
}

/** Options that differ only by a near-synonym, so more than one can be defended. */
export function hasNearSynonymDistractor(options: string[]): boolean {
  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const left = contentWords(options[i]);
      const right = contentWords(options[j]);
      const rightSet = new Set(right);
      const leftSet = new Set(left);
      const onlyLeft = left.filter((word) => !rightSet.has(word));
      const onlyRight = right.filter((word) => !leftSet.has(word));
      if (onlyLeft.length === 0 || onlyRight.length === 0 || onlyLeft.length > 2 || onlyRight.length > 2) continue;
      const leftGroups = onlyLeft.map(synonymGroup);
      const rightGroups = onlyRight.map(synonymGroup);
      if (leftGroups.some((group) => group < 0) || rightGroups.some((group) => group < 0)) continue;
      const shared = new Set(leftGroups);
      if (rightGroups.every((group) => shared.has(group))) return true;
    }
  }
  return false;
}

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function optionsAreDistinct(options: string[]): boolean {
  const cleaned = options.map((option) => option.trim()).filter(Boolean);
  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < cleaned.length; j++) {
      if (cleaned[i].toLowerCase() === cleaned[j].toLowerCase()) return false;
      const left = new Set(contentWords(cleaned[i]));
      const right = new Set(contentWords(cleaned[j]));
      if (left.size === 0 || right.size === 0) continue;
      let overlap = 0;
      for (const word of left) if (right.has(word)) overlap++;
      const union = left.size + right.size - overlap;
      if (union > 0 && overlap / union >= 0.8) return false;
      const smaller = left.size <= right.size ? left : right;
      const larger = left.size <= right.size ? right : left;
      if (smaller.size >= 3) {
        let contained = 0;
        for (const word of smaller) if (larger.has(word)) contained++;
        if (contained === smaller.size) return false;
      }
    }
  }
  return true;
}

function loose(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function splitSentences(story: string): string[] {
  const parts = story.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
  return (parts ?? []).map((part) => part.trim()).filter(Boolean);
}

export function sentenceInStory(sentence: string, story: string): boolean {
  const needle = loose(sentence);
  if (needle.length < 8) return false;
  return loose(story).includes(needle);
}

/** Pick a real story sentence when the model paraphrases the evidence. */
export function closestStorySentence(sentence: string, story: string): string | null {
  const sentences = splitSentences(story);
  const wantedText = loose(sentence);
  if (wantedText.length >= 8 && loose(story).includes(wantedText)) {
    const exact = sentences.find((candidate) => loose(candidate) === wantedText);
    return (exact ?? sentence).trim();
  }
  const wanted = new Set(contentWords(sentence));
  if (wanted.size === 0) return null;
  let best: { text: string; score: number } | null = null;
  for (const candidate of sentences) {
    const words = contentWords(candidate);
    if (!words.length) continue;
    let overlap = 0;
    for (const word of words) if (wanted.has(word)) overlap++;
    const score = overlap / wanted.size;
    if (!best || score > best.score) best = { text: candidate.trim(), score };
  }
  if (best && best.score >= 0.45) return best.text;
  return null;
}
