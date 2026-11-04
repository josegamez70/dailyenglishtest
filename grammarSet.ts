export type GrammarLevel = 'B1' | 'B2' | 'C1';
export type GrammarExerciseType = 'blanks' | 'phrasal' | 'order';

export type GrammarRequest = {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: string;
};

export type GrammarChoice = {
  kind: 'choice';
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export type GrammarOrder = {
  kind: 'order';
  prompt: string;
  chunks: string[];
  explanation: string;
};

export type GrammarItem = GrammarChoice | GrammarOrder;

export type GrammarSet = {
  level: GrammarLevel;
  exercise: GrammarExerciseType;
  topic: string;
  title: string;
  items: GrammarItem[];
};

export type GrammarChunk = { id: string; text: string };

export type OrderProgress = {
  placed: string[];
  pool: GrammarChunk[];
};

export type ItemGrade = {
  prompt: string;
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
};

export const GRAMMAR_ITEM_COUNT = 10;
const MIN_ITEMS = 8;

export function exerciseLabel(exercise: GrammarExerciseType): string {
  if (exercise === 'phrasal') return 'Phrasal verbs';
  if (exercise === 'order') return 'Put in order';
  return 'Fill in the blanks';
}

export function grammarTitle(exercise: GrammarExerciseType): string {
  return `Grammar: ${exerciseLabel(exercise)}`;
}

export function grammarLevel(value: unknown): GrammarLevel {
  return value === 'B2' || value === 'C1' ? value : 'B1';
}

export function grammarExercise(value: unknown): GrammarExerciseType {
  return value === 'phrasal' || value === 'order' ? value : 'blanks';
}

function oneLine(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripChoiceLabel(value: string): string {
  return value.replace(/^\s*(?:\(?[A-Da-d]\)|[A-Da-d][.)])\s+/, '').trim();
}

function hasGap(prompt: string): boolean {
  return /_{3,}/.test(prompt);
}

function readRawItems(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { items?: unknown }).items;
  return Array.isArray(items) ? items : null;
}

function validateChoice(raw: Record<string, unknown>): { ok: true; item: GrammarChoice } | { ok: false; problem: string } {
  const prompt = oneLine(raw.prompt);
  if (!prompt) return { ok: false, problem: 'Each exercise needs a sentence.' };
  if (!hasGap(prompt)) return { ok: false, problem: 'Each sentence needs one gap written as _____.' };
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((option) => stripChoiceLabel(oneLine(option)))
    .filter(Boolean);
  if (options.length !== 4) return { ok: false, problem: 'Each exercise needs exactly 4 options.' };
  const keys = new Set(options.map((option) => option.toLowerCase()));
  if (keys.size !== 4) return { ok: false, problem: 'The 4 options must be different.' };
  const answer = stripChoiceLabel(oneLine(raw.correctAnswer));
  const correctAnswer = options.find((option) => option.toLowerCase() === answer.toLowerCase());
  if (!correctAnswer) return { ok: false, problem: 'The correct answer must be one of the 4 options.' };
  const explanation = oneLine(raw.explanation);
  if (!explanation) return { ok: false, problem: 'Each exercise needs a one-line explanation.' };
  return {
    ok: true,
    item: {
      kind: 'choice',
      prompt,
      options,
      correctAnswer,
      explanation: explanation.slice(0, 220),
    },
  };
}

function validateOrder(raw: Record<string, unknown>): { ok: true; item: GrammarOrder } | { ok: false; problem: string } {
  const chunks = (Array.isArray(raw.chunks) ? raw.chunks : [])
    .map((chunk) => oneLine(chunk))
    .filter(Boolean);
  if (chunks.length < 4 || chunks.length > 6) return { ok: false, problem: 'Put-in-order items need 4 to 6 parts.' };
  const keys = new Set(chunks.map((chunk) => chunk.toLowerCase()));
  if (keys.size !== chunks.length) return { ok: false, problem: 'The parts of an order item must be different.' };
  const explanation = oneLine(raw.explanation);
  if (!explanation) return { ok: false, problem: 'Each exercise needs a one-line explanation.' };
  const prompt = oneLine(raw.prompt) || 'Put these parts in order.';
  return {
    ok: true,
    item: {
      kind: 'order',
      prompt,
      chunks,
      explanation: explanation.slice(0, 220),
    },
  };
}

/** Turn a Gemini grammar payload into a set of about 10 playable items. */
export function normalizeGrammarSet(raw: unknown, request: GrammarRequest): { ok: true; set: GrammarSet } | { ok: false; problems: string[] } {
  const rows = readRawItems(raw);
  if (!rows) return { ok: false, problems: ['Return a JSON object with an items array.'] };
  const items: GrammarItem[] = [];
  const problems: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      problems.push('Each item must be an object.');
      continue;
    }
    const record = row as Record<string, unknown>;
    const checked = request.exercise === 'order' ? validateOrder(record) : validateChoice(record);
    if (checked.ok) items.push(checked.item);
    else problems.push(checked.problem);
    if (items.length === GRAMMAR_ITEM_COUNT) break;
  }
  if (items.length < MIN_ITEMS) {
    const summary = `Need ${GRAMMAR_ITEM_COUNT} usable exercises. Only ${items.length} were usable.`;
    return { ok: false, problems: [summary, ...problems].slice(0, 8) };
  }
  return {
    ok: true,
    set: {
      level: request.level,
      exercise: request.exercise,
      topic: request.topic.trim(),
      title: grammarTitle(request.exercise),
      items,
    },
  };
}

export function buildGrammarPrompt(request: GrammarRequest, correction?: string): string {
  const topicLine = request.topic.trim()
    ? `Every item must practise this grammar topic: "${request.topic.trim().replace(/["\n\r]/g, ' ')}".`
    : 'Choose useful grammar for this level. Vary the items.';
  return `
You write English grammar exercises for learners around the world. Use clear, simple English in every explanation.
Level: ${request.level}.
Exercise: ${exerciseLabel(request.exercise)}.
Make exactly ${GRAMMAR_ITEM_COUNT} items.
${levelGuide(request.level, request.exercise)}
${topicLine}
${taskGuide(request.exercise, request.level)}
Rules:
- There is one clearly correct answer.
- Wrong options are real learner mistakes, not another wording of the right answer.
- explanation is ONE short sentence. No line breaks.
- Do not prefix options or parts with A, B, C, or D.
${shapeGuide(request.exercise)}
${correction ? `Fix these problems:\n${correction}` : ''}
Return only JSON.
`.trim();
}

function levelGuide(level: GrammarLevel, exercise: GrammarExerciseType): string {
  if (exercise === 'phrasal') {
    if (level === 'C1') return 'Use idiomatic phrasal verbs that advanced learners still mix up.';
    if (level === 'B2') return 'Use less obvious phrasal verbs such as put off, come across, get over, and look into.';
    return 'Use common phrasal verbs such as get up, look for, turn off, give up, and look after.';
  }
  if (exercise === 'order') {
    if (level === 'C1') return 'Use advanced sentence structure. Include inversion or other difficult word order in some items.';
    if (level === 'B2') return 'Use clear upper-intermediate sentences, including a conditional, a passive, or reported speech when it fits.';
    return 'Use clear intermediate sentences with common tenses and linking words.';
  }
  if (level === 'C1') return 'Test inversion, cleft sentences, advanced conditionals, and other advanced structures.';
  if (level === 'B2') return 'Test conditionals, the passive, reported speech, and other upper-intermediate grammar.';
  return 'Test B1 grammar such as present and past tenses, the present perfect, going to, and common prepositions.';
}

function taskGuide(exercise: GrammarExerciseType, level: GrammarLevel): string {
  if (exercise === 'order') {
    if (level === 'C1') {
      return 'About half of the items are one difficult sentence split into words or short phrases. The other items are a short paragraph split into sentences. chunks must be the correct order.';
    }
    return 'Each item is a short paragraph split into 4 to 6 sentences or clauses. chunks must be the correct order.';
  }
  if (exercise === 'phrasal') {
    return 'Each prompt is one sentence with exactly one gap written as _____. The 4 options are phrasal verbs.';
  }
  return 'Each prompt is one sentence with exactly one gap written as _____. The 4 options are single words or short phrases.';
}

function shapeGuide(exercise: GrammarExerciseType): string {
  if (exercise === 'order') {
    return 'JSON shape: {"items":[{"prompt":"Put these parts in order.","chunks":["first","second","third","fourth"],"explanation":"One short sentence."}]}';
  }
  return 'JSON shape: {"items":[{"prompt":"She _____ home yesterday.","options":["went","goes","go","going"],"correctAnswer":"went","explanation":"Yesterday needs the past simple."}]}';
}

/** Shuffle parts so the learner does not see the correct order. */
export function shuffleChunks(chunks: string[], random: () => number = Math.random): GrammarChunk[] {
  const items = chunks.map((text, index) => ({ id: `c${index}`, text }));
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = items[index];
    items[index] = items[swap];
    items[swap] = current;
  }
  const unchanged = items.every((item, index) => item.text === chunks[index]);
  if (unchanged && items.length > 1) {
    const first = items[0];
    items[0] = items[1];
    items[1] = first;
  }
  return items;
}

export function freshOrder(shuffled: GrammarChunk[]): OrderProgress {
  return { placed: [], pool: shuffled.map((chunk) => ({ ...chunk })) };
}

export function placeChunk(state: OrderProgress, id: string): OrderProgress {
  if (!state.pool.some((chunk) => chunk.id === id)) return state;
  return {
    placed: [...state.placed, id],
    pool: state.pool.filter((chunk) => chunk.id !== id),
  };
}

/** Put the last tapped part back. The remaining parts stay in their shuffled order. */
export function undoChunk(state: OrderProgress, shuffled: GrammarChunk[]): OrderProgress {
  if (!state.placed.length) return state;
  const placed = state.placed.slice(0, -1);
  const used = new Set(placed);
  return {
    placed,
    pool: shuffled.filter((chunk) => !used.has(chunk.id)),
  };
}

export function resetOrder(shuffled: GrammarChunk[]): OrderProgress {
  return freshOrder(shuffled);
}

export function placedTexts(placed: string[], shuffled: GrammarChunk[]): string[] {
  const byId = new Map(shuffled.map((chunk) => [chunk.id, chunk.text]));
  return placed.map((id) => byId.get(id) ?? '').filter((text) => text.length > 0);
}

export function sameOrder(placed: string[], correct: string[]): boolean {
  return placed.length === correct.length && placed.every((text, index) => text === correct[index]);
}

export function gradeChoice(item: GrammarChoice, selected: string): ItemGrade {
  const userAnswer = selected.trim();
  return {
    prompt: item.prompt,
    correct: userAnswer === item.correctAnswer,
    userAnswer: userAnswer || '—',
    correctAnswer: item.correctAnswer,
    explanation: item.explanation,
  };
}

export function gradeOrder(item: GrammarOrder, chosen: string[]): ItemGrade {
  return {
    prompt: item.prompt,
    correct: sameOrder(chosen, item.chunks),
    userAnswer: chosen.join(' ') || '—',
    correctAnswer: item.chunks.join(' '),
    explanation: item.explanation,
  };
}
