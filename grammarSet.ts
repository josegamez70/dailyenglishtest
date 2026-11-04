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

const GAP = '_____';
const DOUBLED_WORDS = new Set(['that', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'was', 'are', 'were', 'be']);
const AUXILIARIES = new Set(['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'to', 'not', "n't"]);
const PRESENT_BE = new Set(['is', 'am', 'are']);
const PAST_BE = new Set(['was', 'were']);
const CLAUSE_BOUNDARY = new Set(['and', 'but', 'or', 'because', 'when', 'while', 'who', 'which', 'that', 'if', 'although', 'though', 'after', 'before', 'so', 'where', 'whose']);
const ORDER_CONNECTOR = /\b(first|then|after that|finally|because|so|next|later|once)\b/i;
const PHRASAL_PARTICLES = new Set(['up', 'off', 'out', 'on', 'in', 'over', 'away', 'back', 'down', 'through', 'around', 'about', 'into', 'onto', 'across', 'along', 'apart', 'aside', 'forward', 'together', 'by', 'for', 'after', 'with', 'of', 'to', 'round', 'ahead']);
const STANDARD_PHRASALS = new Set(`
get up,get on,get off,get in,get out,get back,get away,get over,get along,get along with,get on with,get rid of,get away with,get round to,
look for,look after,look up,look into,look around,look out,look forward to,look down on,look up to,
turn on,turn off,turn up,turn down,turn around,turn out,turn into,
give up,give back,give in,give away,give out,
pick up,put on,put off,put away,put down,put back,put out,put up,put up with,put through,put forward,put down to,
find out,come back,come in,come on,come across,come up with,come down to,come about,come up against,
go out,go back,go on,go away,go over,go through,go along with,
take off,take on,take up,take after,take over,take away,take apart,take in,take to,
wake up,sit down,stand up,stand for,grow up,fill in,fill out,write down,write off,throw away,try on,try out,
call off,call back,hang up,hang on,hang out,carry on,carry out,work out,work on,set up,set off,set out,set about,
check in,check out,drop off,drop out,hand in,hand out,point out,bring back,bring up,bring about,bring off,
break down,break up,break out,break in,run out,run out of,run into,cut off,cut down,make up,make up for,make out,
hold on,hold up,slow down,hurry up,clean up,tidy up,back up,blow up,calm down,catch up,count on,deal with,
do without,do away with,end up,fall out,fall through,fall back on,figure out,keep on,keep up,let down,live on,live up to,
mix up,own up,pass out,pass away,pay back,pull over,rule out,show up,sort out,speak up,talk over,talk into,talk out of,
think over,think through,use up,watch out,wear out,wind up,brush up,brush up on,zero in,zero in on,account for,
boil down to,dawn on,dispense with,draw up,dwell on,gloss over,lay off,narrow down,opt out,phase out,
resort to,shrug off,single out,step down,tide over,track down,water down,weigh up,wipe out,follow up,follow through,
iron out,pin down,settle for,shake off,stick to,tear down,tie in,touch on,ward off,play down
`.split(',').map((item) => item.trim()).filter(Boolean));

function normalizePromptGap(prompt: string): { prompt: string } | { problem: string } {
  const marked = prompt.replace(/\[(?:blank|gap)\]|\((?:blank|gap)\)|_{3,}/gi, GAP);
  const gaps = marked.split(GAP).length - 1;
  if (gaps === 0) return { problem: 'Each sentence needs one gap written as _____.' };
  if (gaps !== 1) return { problem: 'Each sentence needs exactly one gap, written as _____.' };
  return { prompt: marked.replace(/\s+/g, ' ').trim() };
}

function filledSentence(prompt: string, answer: string): string {
  return prompt.replace(GAP, ` ${answer} `).replace(/\s+/g, ' ').trim();
}

function wordsOf(sentence: string): string[] {
  return sentence.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function hasDoubledFunctionWord(sentence: string): boolean {
  const words = wordsOf(sentence);
  return words.some((word, index) => index > 0 && word === words[index - 1] && DOUBLED_WORDS.has(word));
}

/** "What is needed was..." mixes a present and a past form of be in one clause. */
function hasBareTenseClash(sentence: string): boolean {
  const words = wordsOf(sentence);
  let last: 'present' | 'past' | null = null;
  for (const word of words) {
    if (CLAUSE_BOUNDARY.has(word)) {
      last = null;
      continue;
    }
    const kind = PRESENT_BE.has(word) ? 'present' : PAST_BE.has(word) ? 'past' : null;
    if (!kind) continue;
    if (last && last !== kind) return true;
    last = kind;
  }
  return false;
}

function contentKey(option: string): string {
  return wordsOf(option).filter((word) => !AUXILIARIES.has(word)).join(' ');
}

function hasTenseTwin(options: string[]): boolean {
  const seen = new Set<string>();
  for (const option of options) {
    const key = contentKey(option);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

const IRREGULAR_BASES: Record<string, string> = {
  got: 'get', gotten: 'get', getting: 'get', gets: 'get',
  went: 'go', gone: 'go', going: 'go', goes: 'go',
  took: 'take', taken: 'take', taking: 'take', takes: 'take',
  came: 'come', coming: 'come', comes: 'come',
  made: 'make', making: 'make', makes: 'make',
  found: 'find', finding: 'find', finds: 'find',
  gave: 'give', given: 'give', giving: 'give', gives: 'give',
  brought: 'bring', bringing: 'bring', brings: 'bring',
  broke: 'break', broken: 'break', breaking: 'break', breaks: 'break',
  ran: 'run', running: 'run', runs: 'run',
  left: 'leave', leaving: 'leave', leaves: 'leave',
  held: 'hold', holding: 'hold', holds: 'hold',
  kept: 'keep', keeping: 'keep', keeps: 'keep',
  fell: 'fall', fallen: 'fall', falling: 'fall', falls: 'fall',
  grew: 'grow', grown: 'grow', growing: 'grow', grows: 'grow',
  woke: 'wake', woken: 'wake', waking: 'wake', wakes: 'wake',
  sat: 'sit', sitting: 'sit', sits: 'sit',
  stood: 'stand', standing: 'stand', stands: 'stand',
  wrote: 'write', written: 'write', writing: 'write', writes: 'write',
  threw: 'throw', thrown: 'throw', throwing: 'throw', throws: 'throw',
  hung: 'hang', hanging: 'hang', hangs: 'hang',
  caught: 'catch', catching: 'catch', catches: 'catch',
  thought: 'think', thinking: 'think', thinks: 'think',
  wore: 'wear', worn: 'wear', wearing: 'wear', wears: 'wear',
  spoke: 'speak', spoken: 'speak', speaking: 'speak', speaks: 'speak',
  paid: 'pay', paying: 'pay', pays: 'pay',
  felt: 'feel', feeling: 'feel', feels: 'feel',
  met: 'meet', meeting: 'meet', meets: 'meet',
  bought: 'buy', buying: 'buy', buys: 'buy',
  told: 'tell', telling: 'tell', tells: 'tell',
  said: 'say', saying: 'say', says: 'say',
  built: 'build', building: 'build', builds: 'build',
  sent: 'send', sending: 'send', sends: 'send',
  spent: 'spend', spending: 'spend', spends: 'spend',
  won: 'win', winning: 'win', wins: 'win',
  lost: 'lose', losing: 'lose', loses: 'lose',
  blew: 'blow', blown: 'blow', blowing: 'blow', blows: 'blow',
  shook: 'shake', shaken: 'shake', shaking: 'shake', shakes: 'shake',
  tore: 'tear', torn: 'tear', tearing: 'tear', tears: 'tear',
  stuck: 'stick', sticking: 'stick', sticks: 'stick',
  cut: 'cut', cutting: 'cut', cuts: 'cut',
  put: 'put', putting: 'put', puts: 'put',
  set: 'set', setting: 'set', sets: 'set',
  let: 'let', letting: 'let', lets: 'let',
  did: 'do', done: 'do', doing: 'do', does: 'do',
  had: 'have', has: 'have', having: 'have',
};

function verbBases(token: string): string[] {
  const word = token.toLowerCase();
  const bases = new Set<string>([word]);
  if (IRREGULAR_BASES[word]) bases.add(IRREGULAR_BASES[word]);
  if (word.endsWith('ies') && word.length > 4) bases.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 4) bases.add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) bases.add(word.slice(0, -1));
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    bases.add(stem);
    bases.add(`${stem}e`);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) bases.add(stem.slice(0, -1));
  }
  if (word.endsWith('ied') && word.length > 4) bases.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    bases.add(stem);
    bases.add(`${stem}e`);
  }
  return [...bases];
}

function isStandardPhrasal(option: string): boolean {
  const words = wordsOf(option);
  let start = 0;
  while (start < words.length && AUXILIARIES.has(words[start])) start += 1;
  const core = words.slice(start);
  if (core.length < 2 || core.length > 4) return false;
  const particleAt = core.findIndex((word, index) => index > 0 && PHRASAL_PARTICLES.has(word));
  if (particleAt !== 1) return false;
  const rest = core.slice(1).join(' ');
  return verbBases(core[0]).some((verb) => STANDARD_PHRASALS.has(`${verb} ${rest}`));
}

function choiceQualityProblem(item: GrammarChoice, exercise: GrammarExerciseType): string | null {
  const filled = filledSentence(item.prompt, item.correctAnswer);
  if (hasDoubledFunctionWord(filled)) {
    return 'Filling the gap repeats a word. The sentence must sound natural with the answer in it.';
  }
  if (hasBareTenseClash(filled)) {
    return 'The sentence mixes present and past, such as "is" and "was". Use one natural tense.';
  }
  if (hasTenseTwin(item.options)) {
    return 'Two options are the same phrase in different tenses, so more than one can be correct. Make the wrong options clearly wrong.';
  }
  if (exercise === 'phrasal' && item.options.some((option) => !isStandardPhrasal(option))) {
    return 'Every option must be a real phrasal verb, used with its normal meaning. Do not invent one.';
  }
  return null;
}

function orderQualityProblem(item: GrammarOrder, level: GrammarLevel): string | null {
  const paragraph = item.chunks.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[.!?]$/.test(paragraph)) return 'The last part must end with . ! or ?';
  if (level === 'C1') return null;
  if (item.chunks.some((chunk) => chunk.split(/\s+/).filter(Boolean).length < 3)) {
    return 'At B1 and B2 each part must be a sentence or clause, not a short phrase that could move.';
  }
  if (!ORDER_CONNECTOR.test(paragraph)) {
    return 'At B1 and B2 use connectors such as first, then, after that, finally, because, or so, so only one order works.';
  }
  return null;
}

function readRawItems(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as { items?: unknown }).items;
  return Array.isArray(items) ? items : null;
}

function validateChoice(raw: Record<string, unknown>, exercise: GrammarExerciseType): { ok: true; item: GrammarChoice } | { ok: false; problem: string } {
  const prompt = normalizePromptGap(oneLine(raw.prompt));
  if ('problem' in prompt) return { ok: false, problem: prompt.problem };
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
  const item: GrammarChoice = {
    kind: 'choice',
    prompt: prompt.prompt,
    options,
    correctAnswer,
    explanation: explanation.slice(0, 220),
  };
  const quality = choiceQualityProblem(item, exercise);
  if (quality) return { ok: false, problem: quality };
  return { ok: true, item };
}

function validateOrder(raw: Record<string, unknown>, level: GrammarLevel): { ok: true; item: GrammarOrder } | { ok: false; problem: string } {
  const chunks = (Array.isArray(raw.chunks) ? raw.chunks : [])
    .map((chunk) => oneLine(chunk))
    .filter(Boolean);
  if (chunks.length < 4 || chunks.length > 6) return { ok: false, problem: 'Put-in-order items need 4 to 6 parts.' };
  const keys = new Set(chunks.map((chunk) => chunk.toLowerCase()));
  if (keys.size !== chunks.length) return { ok: false, problem: 'The parts of an order item must be different.' };
  const explanation = oneLine(raw.explanation);
  if (!explanation) return { ok: false, problem: 'Each exercise needs a one-line explanation.' };
  const prompt = oneLine(raw.prompt) || 'Put these parts in order.';
  const item: GrammarOrder = {
    kind: 'order',
    prompt,
    chunks,
    explanation: explanation.slice(0, 220),
  };
  const quality = orderQualityProblem(item, level);
  if (quality) return { ok: false, problem: quality };
  return { ok: true, item };
}

/** Turn a Gemini grammar payload into a set of about 10 playable items. */
export function normalizeGrammarSet(raw: unknown, request: GrammarRequest): { ok: true; set: GrammarSet } | { ok: false; problems: string[] } {
  const rows = readRawItems(raw);
  if (!rows) return { ok: false, problems: ['Return a JSON object with an items array.'] };
  const items: GrammarItem[] = [];
  const problems: string[] = [];
  const seenAnswers = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      problems.push('Each item must be an object.');
      continue;
    }
    const record = row as Record<string, unknown>;
    const checked = request.exercise === 'order' ? validateOrder(record, request.level) : validateChoice(record, request.exercise);
    if (!checked.ok) {
      problems.push(checked.problem);
      continue;
    }
    const answerKey = checked.item.kind === 'choice'
      ? checked.item.correctAnswer.toLowerCase()
      : checked.item.chunks.join('|').toLowerCase();
    if (seenAnswers.has(answerKey)) {
      problems.push('Do not repeat the same correct answer. Test a different point.');
      continue;
    }
    seenAnswers.add(answerKey);
    items.push(checked.item);
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
  const topic = request.topic.trim().replace(/["\n\r]/g, ' ');
  const topicLine = topic
    ? `Topic: "${topic}". Cover different aspects of this topic across the 10 items. Vary the items. For example, present perfect should mix has/have, past participles, already/yet/just, for/since, and present perfect versus past simple. Do not test the same contrast every time.`
    : 'Choose useful grammar for this level. Vary the items. Each item should test a different point.';
  return `
You write English grammar exercises for learners around the world. Explanations use clear, simple English.
Level: ${request.level}.
Exercise: ${exerciseLabel(request.exercise)}.
Make exactly ${GRAMMAR_ITEM_COUNT} items.
${levelGuide(request.level, request.exercise)}
${topicLine}
${taskGuide(request.exercise, request.level)}
Self-check every item before you keep it:
- Put the correct answer into the gap and read the whole sentence. It must be natural, idiomatic, and fully correct.
- Do not repeat a word. Bad: "only after the meeting _____ that I realized" with the answer "that", because that makes "that that".
- Do not mix tenses. Bad: "What _____ was a better sense" with the answer "is needed".
- Then try each wrong option in the same gap. Exactly one option may be correct. If a second option also sounds acceptable, change the sentence or the options.
- Do not offer the same phrase in two tenses. Bad: "has been postponed" and "had been postponed" in reported speech, because both can be right.
- Do not use the same correct answer twice in the set.
- Write the gap as exactly ${GAP}. One gap only.
- explanation is ONE short sentence. No line breaks.
- Do not prefix options or parts with A, B, C, or D.
${shapeGuide(request.exercise)}
${correction ? `Fix these problems:\n${correction}` : ''}
Return only JSON.
`.trim();
}

function levelGuide(level: GrammarLevel, exercise: GrammarExerciseType): string {
  if (exercise === 'phrasal') {
    if (level === 'C1') return 'Use idiomatic but standard phrasal verbs that advanced learners still mix up. The sentence must sound like something a fluent speaker would say.';
    if (level === 'B2') return 'Use less obvious standard phrasal verbs such as put off, come across, get over, and look into.';
    return 'Use common standard phrasal verbs such as get up, look for, turn off, give up, and look after.';
  }
  if (exercise === 'order') {
    if (level === 'C1') return 'Mix short paragraphs with some complex sentences. A complex item may be one sentence split into words or short phrases, and it still needs one correct order and normal punctuation. Prefer natural, idiomatic English. Avoid awkward constructions.';
    if (level === 'B2') return 'Write a short everyday paragraph. One logical order only. You may include a conditional, a passive, or reported speech when it fits.';
    return 'Write a short everyday paragraph in clear intermediate English. One logical order only.';
  }
  if (level === 'C1') return 'Test inversion, cleft sentences, advanced conditionals, and other advanced structures. Prefer natural, idiomatic sentences a fluent speaker would say. Avoid awkward constructions built only to show the rule.';
  if (level === 'B2') return 'Test conditionals, the passive, reported speech, and other upper-intermediate grammar. Add a time word or a reporting detail so only one option fits.';
  return 'Test B1 grammar such as present and past tenses, the present perfect, going to, and common prepositions. Add a time word when the tense is what you are testing.';
}

function taskGuide(exercise: GrammarExerciseType, level: GrammarLevel): string {
  if (exercise === 'order') {
    if (level === 'C1') {
      return 'About half of the items are a short paragraph of 4 to 6 sentences. The others may be one complex sentence split into words or short phrases. chunks are the correct order. Use normal punctuation, and make the last part end with . ! or ?';
    }
    return 'Each item is a short paragraph of 4 to 6 sentences or clauses in the correct order. Use connectors such as first, then, after that, finally, because, or so, so the parts cannot be rearranged. Do not split one sentence into adverbials that could go in more than one place. The last part ends with . ! or ?';
  }
  if (exercise === 'phrasal') {
    return 'Each prompt is one natural sentence with exactly one gap written as _____. Each of the 4 options is a real dictionary phrasal verb (verb + particle), in the form that fits the gap. Use its established meaning and the correct transitive or intransitive pattern. Bad: "cloud over your judgment". Bad: "root out the truth". Good: "look after the children", "put off the meeting", "come across an old letter".';
  }
  return 'Each prompt is one natural sentence with exactly one gap written as _____. The 4 options are single words or short phrases. Wrong options must be clearly wrong in this sentence, not another acceptable tense of the right phrase.';
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
