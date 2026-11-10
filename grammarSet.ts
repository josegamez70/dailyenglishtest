import { INVENTED_PHRASALS, REAL_PHRASAL_VERBS } from './phrasalVerbs.ts';

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

export const GRAMMAR_ITEM_COUNT = 6;
/** Keep a generated set when at least this many items pass the checks. */
export const GRAMMAR_MIN_ITEMS = 4;
/** Ask the model for more items than we keep, so filtering can still leave a full set. */
export const GRAMMAR_GENERATION_COUNT = 9;

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

function choiceQualityProblem(item: GrammarChoice, exercise: GrammarExerciseType): string | null {
  const filled = filledSentence(item.prompt, item.correctAnswer);
  if (hasDoubledFunctionWord(filled)) {
    return 'Filling the gap repeats a word. The sentence must sound natural with the answer in it.';
  }
  if (hasBareTenseClash(filled)) {
    return 'The sentence mixes present and past, such as "is" and "was". Use one natural tense.';
  }
  if (exercise === 'phrasal') {
    const grouped = phrasalGroupProblem(item.options);
    if (grouped) return grouped;
  }
  if (exercise === 'blanks' && ambiguousBlank(item)) {
    return 'More than one option can be correct here. Change the sentence so only one option fits.';
  }
  return null;
}

const DEGREE_ADVERBS = new Set(['somewhat', 'slightly', 'rather', 'fairly', 'quite', 'pretty', 'a bit', 'a little']);

function optionVerb(option: string): string {
  const words = normalizedOption(option).split(' ').filter(Boolean);
  let index = 0;
  while (index < words.length && AUXILIARIES.has(words[index])) index += 1;
  return words[index] ?? '';
}

const PARTICLES = new Set(`
up down on off in out over under away back through around round about along across by for with to into onto
apart forward ahead aside together upon after against of from at aback forth without home rid
`.split(/\s+/).filter(Boolean));

const PHRASAL_BY_VERB = new Map<string, Set<string>>();
for (const phrase of REAL_PHRASAL_VERBS) {
  const [verb, ...rest] = phrase.split(' ');
  if (!verb || rest.length === 0) continue;
  const particles = PHRASAL_BY_VERB.get(verb) ?? new Set<string>();
  particles.add(rest.join(' '));
  PHRASAL_BY_VERB.set(verb, particles);
}
const INVENTED_PHRASAL_SET = new Set(INVENTED_PHRASALS);

export const REAL_PHRASAL_COUNT = new Set(REAL_PHRASAL_VERBS).size;

export const BASIC_PHRASALS = new Set(`
get up, look for, turn off, turn on, give up, look after, put on, put off, pick up, find out, come back, go out,
wake up, get in, get on, get off, take off, put away, look up, go back, come in, come on, check in, check out,
fill in, fill out, drop off, hand in, grow up, end up, show up, sit down, stand up, turn up, put out, give back,
give in, call back, hang up, come out, go away, get out, put back, take out, wake up
`.split(',').map((item) => item.trim()).filter(Boolean));

// Upper-intermediate band. Scoring prefers these at B2, and the variation note samples them.
// Keep this set out of BASIC_PHRASALS and out of C1_PHRASALS.
export const B2_PHRASALS = new Set(`
get over, come up with, put up with, run out of, turn down, carry out, come across, look into, get away with,
make up for, break down, call off, fall through, point out, rule out, take over, figure out, bring up, set up,
work out, look forward to, come down to, run into, go through, catch up with, do away with, fall back on,
account for, back up, break off, break out, break up, bring out, build up, bump into, call for, carry on,
cut down, cut down on, deal with, do without, drop out, fall out, get by, get on with, get rid of, get through,
give away, go through with, hold up, keep up, let down, make out, make up, put together, run over, set out,
sort out, stand for, take after, take up, tell off, turn out, wear off,
allow for, break through, brush up, call on, catch on, catch up on, check up on, come about, come out with,
come up against, count on, cover up, cut back on, dawn on, die out, draw up, face up to, fall apart, fall behind,
fall for, follow up, get across, get ahead, get along with, get around to, get at, get down to, get out of,
go along with, go back on, go into, go over, go without, grow out of, hand over, hold back, keep up with,
lay off, leave out, live up to, look down on, look up to, miss out on, mix up, own up, pay back, pay off,
pick on, pull off, pull through, put aside, put forward, see to, settle for, stand out, stand up for, stick to,
sum up, take in, take on, talk into, think over, try out, work on, wrap up
`.split(',').map((item) => item.trim()).filter(Boolean));

// Advanced band. Scoring prefers these at C1, and the variation note samples whole groups.
// Every verb has at least three real particles, so an item can be built without inventing one.
// Keep this set out of BASIC_PHRASALS and out of B2_PHRASALS.
export const C1_PHRASALS = new Set(`
bring about, bring off, bring around, bring forth,
play down, play along, play off, play up,
boil down to, boil over, boil down, boil up,
brush aside, brush off, brush up on,
hammer out, hammer away, hammer home,
write off, write up, write out, write in,
weigh up, weigh in, weigh on, weigh down,
run up against, run through, run across, run off with,
come down with, come apart, come forward, come upon,
look back on, look upon, look ahead, look out for,
take aback, take to, take apart, take out on,
turn against, turn away, turn in, turn over,
put through, put across, put down to, put in for,
set about, set forth, set back, set apart,
make off with, make for, make over, make away with,
hold out for, hold on to, hold against, hold off,
keep from, keep at, keep to, keep off,
pull together, pull apart, pull ahead, pull away,
pass off, pass over, pass up, pass for,
stick with, stick by, stick up for, stick at,
call upon, call up, call in, call out,
fall out with, fall back, fall over, fall in,
draw on, draw out, draw into, draw back,
live down, live through, live off, live with,
stand up to, stand in for, stand by, stand down,
work through, work up, work off, work up to,
hand down, hand out, hand back,
see through, see off, see out,
carry through, carry off, carry over, carry away,
break away, break into, break out of, break in,
talk out of, talk round, talk down to, talk over,
lay out, lay into, lay down, lay up,
bear with, bear out, bear down on, bear up,
back down, back out, back away, back off,
think through, think up, think back, think ahead,
settle on, settle up, settle down, settle in
`.split(',').map((item) => item.trim()).filter(Boolean));

function verbBases(token: string): string[] {
  const word = token.toLowerCase();
  const bases = new Set<string>([word]);
  const irregular: Record<string, string> = {
    got: 'get', gotten: 'get', gets: 'get', getting: 'get',
    went: 'go', goes: 'go', going: 'go', gone: 'go',
    took: 'take', takes: 'take', taking: 'take', taken: 'take',
    came: 'come', comes: 'come', coming: 'come',
    ran: 'run', runs: 'run', running: 'run',
    broke: 'break', breaks: 'break', breaking: 'break', broken: 'break',
    gave: 'give', gives: 'give', giving: 'give', given: 'give',
    made: 'make', makes: 'make', making: 'make',
    puts: 'put', putting: 'put',
    brought: 'bring', brings: 'bring', bringing: 'bring',
    thought: 'think', thinks: 'think', thinking: 'think',
    caught: 'catch', catches: 'catch', catching: 'catch',
    fell: 'fall', falls: 'fall', falling: 'fall', fallen: 'fall',
    found: 'find', finds: 'find', finding: 'find',
    held: 'hold', holds: 'hold', holding: 'hold',
    kept: 'keep', keeps: 'keep', keeping: 'keep',
    left: 'leave', leaves: 'leave', leaving: 'leave',
    paid: 'pay', pays: 'pay', paying: 'pay',
    spoke: 'speak', spoken: 'speak', speaks: 'speak', speaking: 'speak',
    stood: 'stand', stands: 'stand', standing: 'stand',
    wrote: 'write', written: 'write', writes: 'write', writing: 'write',
    woke: 'wake', woken: 'wake', wakes: 'wake', waking: 'wake',
    wore: 'wear', worn: 'wear', wears: 'wear', wearing: 'wear',
    hung: 'hang', hangs: 'hang', hanging: 'hang',
    dealt: 'deal', deals: 'deal', dealing: 'deal',
    grew: 'grow', grown: 'grow', grows: 'grow', growing: 'grow',
    drew: 'draw', drawn: 'draw', draws: 'draw', drawing: 'draw',
    drove: 'drive', driven: 'drive', drives: 'drive', driving: 'drive',
    threw: 'throw', thrown: 'throw', throws: 'throw', throwing: 'throw',
    stuck: 'stick', sticks: 'stick', sticking: 'stick',
    laid: 'lay', lays: 'lay', laying: 'lay',
    sent: 'send', sends: 'send', sending: 'send',
    sold: 'sell', sells: 'sell', selling: 'sell',
    spent: 'spend', spends: 'spend', spending: 'spend',
    built: 'build', builds: 'build', building: 'build',
    chose: 'choose', chosen: 'choose', chooses: 'choose', choosing: 'choose',
    forgot: 'forget', forgotten: 'forget', forgets: 'forget', forgetting: 'forget',
    rose: 'rise', risen: 'rise', rises: 'rise', rising: 'rise',
    shook: 'shake', shaken: 'shake', shakes: 'shake', shaking: 'shake',
    blew: 'blow', blown: 'blow', blows: 'blow', blowing: 'blow',
    hid: 'hide', hidden: 'hide', hides: 'hide', hiding: 'hide',
    lit: 'light', lighted: 'light', lights: 'light', lighting: 'light',
    meant: 'mean', means: 'mean', meaning: 'mean',
    met: 'meet', meets: 'meet', meeting: 'meet',
    shot: 'shoot', shoots: 'shoot', shooting: 'shoot',
    taught: 'teach', teaches: 'teach', teaching: 'teach',
    told: 'tell', tells: 'tell', telling: 'tell',
    understood: 'understand', understands: 'understand', understanding: 'understand',
    won: 'win', wins: 'win', winning: 'win',
    wound: 'wind', winds: 'wind', winding: 'wind',
    beat: 'beat', beaten: 'beat', beats: 'beat', beating: 'beat',
    became: 'become', becomes: 'become', becoming: 'become',
    began: 'begin', begun: 'begin', begins: 'begin', beginning: 'begin',
    ate: 'eat', eaten: 'eat', eats: 'eat', eating: 'eat',
    drank: 'drink', drunk: 'drink', drinks: 'drink', drinking: 'drink',
    flew: 'fly', flown: 'fly', flies: 'fly', flying: 'fly',
    rode: 'ride', ridden: 'ride', rides: 'ride', riding: 'ride',
    rang: 'ring', rung: 'ring', rings: 'ring', ringing: 'ring',
    sang: 'sing', sung: 'sing', sings: 'sing', singing: 'sing',
    sank: 'sink', sunk: 'sink', sinks: 'sink', sinking: 'sink',
    swam: 'swim', swum: 'swim', swims: 'swim', swimming: 'swim',
    froze: 'freeze', frozen: 'freeze', freezes: 'freeze', freezing: 'freeze',
    lost: 'lose', loses: 'lose', losing: 'lose',
    led: 'lead', leads: 'lead', leading: 'lead',
    fed: 'feed', feeds: 'feed', feeding: 'feed',
    slept: 'sleep', sleeps: 'sleep', sleeping: 'sleep',
    sought: 'seek', seeks: 'seek', seeking: 'seek',
    fought: 'fight', fights: 'fight', fighting: 'fight',
    bought: 'buy', buys: 'buy', buying: 'buy',
    cut: 'cut', cuts: 'cut', cutting: 'cut',
    set: 'set', sets: 'set', setting: 'set',
    let: 'let', lets: 'let', letting: 'let',
    read: 'read', reads: 'read', reading: 'read',
  };
  if (irregular[word]) bases.add(irregular[word]);
  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3);
    bases.add(stem);
    bases.add(`${stem}e`);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) bases.add(stem.slice(0, -1));
  }
  if (word.endsWith('ed') && word.length > 3) bases.add(word.slice(0, -2));
  if (word.endsWith('es') && word.length > 3) bases.add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) bases.add(word.slice(0, -1));
  return [...bases];
}

function phrasalCore(option: string): { bases: string[]; rest: string } | null {
  const words = wordsOf(option);
  let start = 0;
  while (start < words.length && AUXILIARIES.has(words[start])) start += 1;
  const core = words.slice(start);
  if (core.length < 2) return null;
  return { bases: verbBases(core[0]), rest: core.slice(1).join(' ') };
}

function canonicalPhrasal(option: string): string {
  const core = phrasalCore(option);
  if (!core) return '';
  for (const verb of core.bases) {
    if (PHRASAL_BY_VERB.get(verb)?.has(core.rest)) return `${verb} ${core.rest}`;
  }
  return `${core.bases[0] ?? ''} ${core.rest}`.trim();
}

function isRealPhrasal(option: string): boolean {
  const core = phrasalCore(option);
  if (!core) return false;
  if (core.bases.some((verb) => INVENTED_PHRASAL_SET.has(`${verb} ${core.rest}`))) return false;
  if (core.bases.some((verb) => PHRASAL_BY_VERB.get(verb)?.has(core.rest))) return true;
  // A listed verb only takes the particles we know. "gloss up" is not "gloss over".
  if (core.bases.some((verb) => PHRASAL_BY_VERB.has(verb))) return false;
  return core.rest.split(' ').every((part) => PARTICLES.has(part));
}

function phrasalGroupProblem(options: string[]): string | null {
  if (options.some((option) => !option.includes(' ') || !isRealPhrasal(option))) {
    return 'Every option must be a real phrasal verb, such as "put off" or "gloss over". Do not invent one like "gloss up" or "dream off", and do not use a single-word verb.';
  }
  const counts = new Map<string, number>();
  for (const verb of options.map(optionVerb)) counts.set(verb, (counts.get(verb) ?? 0) + 1);
  const most = Math.max(...counts.values());
  const others = options.length - most;
  if (most >= 3 || (most >= 2 && others >= 2)) return null;
  return 'Use at least three options with the same verb and different real particles, or two with the same verb plus two other real phrasal verbs.';
}

function itemScore(item: GrammarItem, request: GrammarRequest): number {
  if (request.exercise !== 'phrasal' || item.kind !== 'choice') return 0;
  const phrase = canonicalPhrasal(item.correctAnswer);
  const basic = BASIC_PHRASALS.has(phrase);
  const upper = B2_PHRASALS.has(phrase);
  const advanced = C1_PHRASALS.has(phrase);
  if (request.level === 'C1') {
    if (advanced) return 2;
    if (upper) return 1;
    if (basic) return -2;
    return 0;
  }
  if (request.level === 'B2') {
    if (upper) return 2;
    if (advanced) return 1;
    if (basic) return -1;
    return 0;
  }
  if (basic) return 1;
  if (advanced) return -1;
  return 0;
}

function mainPhrasalVerb(options: string[]): string {
  const counts = new Map<string, number>();
  for (const verb of options.map(optionVerb)) counts.set(verb, (counts.get(verb) ?? 0) + 1);
  // When two verbs are equally common, the name decides. Option order must not matter, because the choices are shuffled.
  return [...counts.entries()].sort((left, right) => (
    right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)
  ))[0]?.[0] ?? '';
}

function mostAreDegreeAdverbs(options: string[]): boolean {
  const hits = options.filter((option) => DEGREE_ADVERBS.has(normalizedOption(option))).length;
  return hits >= 3;
}

function hasWillAndGoingTo(options: string[]): boolean {
  const texts = options.map(normalizedOption);
  const will = texts.some((text) => text === 'will' || text.startsWith('will '));
  const goingTo = texts.some((text) => /\b(?:am|is|are) going to\b/.test(text) || text === 'going to' || text.startsWith('going to '));
  return will && goingTo;
}

const MODAL_PERFECTS = ['might have', 'could have', 'should have', 'ought to have'];

function normalizedOption(option: string): string {
  return option.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function modalPerfectCount(options: string[]): number {
  return options.filter((option) => {
    const text = normalizedOption(option);
    return MODAL_PERFECTS.some((modal) => text === modal || text.startsWith(`${modal} `));
  }).length;
}

function hasModalDisambiguator(prompt: string): boolean {
  return /supposed to|required|no other possibility|the only possibility|it was impossible|it is impossible/i.test(prompt);
}

function tooManyCleftRelatives(prompt: string, options: string[]): boolean {
  if (!/^it (?:was|is)\b/i.test(prompt.trim())) return false;
  const relatives = new Set(
    options.map((option) => normalizedOption(option)).filter((option) => option === 'that' || option === 'which' || option === 'who'),
  );
  return relatives.size >= 2;
}

function suggestBothShapes(prompt: string, options: string[]): boolean {
  if (!/\b(?:suggest(?:ed|s|ing)?|recommend(?:ed|s|ing)?|insist(?:ed|s|ing)?)\b/i.test(prompt)) return false;
  const gerund = options.some((option) => /^[a-z]+ing$/i.test(option.trim()));
  const clause = options.some((option) => /^(?:that|we|i|you|they|he|she)\b/i.test(option.trim()));
  return gerund && clause;
}

function ambiguousBlank(item: GrammarChoice): boolean {
  if (suggestBothShapes(item.prompt, item.options)) return true;
  if (tooManyCleftRelatives(item.prompt, item.options)) return true;
  if (modalPerfectCount(item.options) >= 2 && !hasModalDisambiguator(item.prompt)) return true;
  if (mostAreDegreeAdverbs(item.options)) return true;
  if (hasWillAndGoingTo(item.options)) return true;
  return false;
}

function orderQualityProblem(item: GrammarOrder, level: GrammarLevel): string | null {
  const paragraph = item.chunks.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[.!?]$/.test(paragraph)) return 'The last part must end with . ! or ?';
  if (level === 'C1') return null;
  if (item.chunks.some((chunk) => chunk.split(/\s+/).filter(Boolean).length < 3)) {
    return 'At B1 and B2 each part must be a sentence or clause, not a short phrase that could move.';
  }
  if (level === 'B1' && item.chunks.some(isLooseFragment)) {
    return 'At B1 each part must be a full sentence. Do not use a fragment such as "until the crust was golden brown".';
  }
  return null;
}

function isLooseFragment(chunk: string): boolean {
  const text = chunk.trim();
  if (!/^[A-Z]/.test(text) || !/[.!?]$/.test(text)) return true;
  if (text.includes(',')) return false;
  return /^(?:until|before|after|when|while|if|because|although|unless|once)\s+(?!that\b)/i.test(text);
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

type ScoredItem = { item: GrammarItem; index: number };

function answerKey(item: GrammarItem): string {
  return item.kind === 'choice' ? item.correctAnswer.toLowerCase() : item.chunks.join('|').toLowerCase();
}

function grammarSetFrom(request: GrammarRequest, items: GrammarItem[]): GrammarSet {
  return {
    level: request.level,
    exercise: request.exercise,
    topic: request.topic.trim(),
    title: grammarTitle(request.exercise),
    items,
  };
}

/** Keep the strongest passing items, at most GRAMMAR_ITEM_COUNT, without repeating an answer or a base verb. */
function selectGrammarItems(pool: ScoredItem[], request: GrammarRequest, problems: string[]): GrammarItem[] {
  const ranked = [...pool].sort((left, right) => itemScore(right.item, request) - itemScore(left.item, request) || left.index - right.index);
  const seenAnswers = new Set<string>();
  const seenPrompts = new Set<string>();
  const verbCounts = new Map<string, number>();
  const items: GrammarItem[] = [];
  for (const entry of ranked) {
    const key = answerKey(entry.item);
    if (seenAnswers.has(key)) {
      problems.push('Do not repeat the same correct answer. Test a different point.');
      continue;
    }
    if (entry.item.kind === 'choice' && seenPrompts.has(entry.item.prompt.toLowerCase())) {
      problems.push('Do not repeat the same sentence.');
      continue;
    }
    if (request.exercise === 'phrasal' && entry.item.kind === 'choice') {
      const verb = mainPhrasalVerb(entry.item.options);
      if ((verbCounts.get(verb) ?? 0) >= 2) {
        problems.push('Use each base verb in at most two items.');
        continue;
      }
      verbCounts.set(verb, (verbCounts.get(verb) ?? 0) + 1);
    }
    seenAnswers.add(key);
    if (entry.item.kind === 'choice') seenPrompts.add(entry.item.prompt.toLowerCase());
    items.push(entry.item);
    if (items.length === GRAMMAR_ITEM_COUNT) break;
  }
  return items;
}

export type GrammarNormalizeResult =
  | { ok: true; set: GrammarSet; items: GrammarItem[] }
  | { ok: false; problems: string[]; items: GrammarItem[] };

function finishGrammarSet(
  request: GrammarRequest,
  items: GrammarItem[],
  problems: string[],
  random: () => number,
): GrammarNormalizeResult {
  const ready = items.map((item) => (item.kind === 'choice' ? shuffleChoiceOptions(item, random) : item));
  if (ready.length < GRAMMAR_MIN_ITEMS) {
    const summary = `Only ${ready.length} exercises were usable. Need at least ${GRAMMAR_MIN_ITEMS}.`;
    return { ok: false, problems: [summary, ...problems].slice(0, 8), items: ready };
  }
  const set = grammarSetFrom(request, ready);
  return { ok: true, set, items: set.items };
}

/**
 * Turn a Gemini grammar payload into a playable set.
 * Keeps the best GRAMMAR_ITEM_COUNT items when more pass, and still returns a set at GRAMMAR_MIN_ITEMS.
 * Multiple-choice options are shuffled so the correct answer is not always the first one.
 * Pass kept items to merge a top-up payload without repeating them.
 */
export function normalizeGrammarSet(
  raw: unknown,
  request: GrammarRequest,
  options?: { kept?: GrammarItem[]; random?: () => number },
): GrammarNormalizeResult {
  const kept = options?.kept ?? [];
  const random = options?.random ?? Math.random;
  const pool: ScoredItem[] = kept.map((item, index) => ({ item, index }));
  const problems: string[] = [];
  const rows = readRawItems(raw);
  if (!rows) {
    const items = selectGrammarItems(pool, request, problems);
    if (!kept.length) return { ok: false, problems: ['Return a JSON object with an items array.'], items: [] };
    return finishGrammarSet(request, items, problems, random);
  }
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') {
      problems.push('Each item must be an object.');
      return;
    }
    const record = row as Record<string, unknown>;
    const checked = request.exercise === 'order' ? validateOrder(record, request.level) : validateChoice(record, request.exercise);
    if (!checked.ok) {
      problems.push(checked.problem);
      return;
    }
    pool.push({ item: checked.item, index: kept.length + index + 1 });
  });
  return finishGrammarSet(request, selectGrammarItems(pool, request, problems), problems, random);
}

export function buildGrammarPrompt(
  request: GrammarRequest,
  correction?: string,
  options?: { count?: number; extra?: string; seed?: number },
): string {
  const count = options?.count ?? GRAMMAR_GENERATION_COUNT;
  const seed = options?.seed ?? Math.floor(Math.random() * 10000);
  const itemWord = count === 1 ? 'item' : 'items';
  const topic = request.topic.trim().replace(/["\n\r]/g, ' ');
  const topicLine = topic
    ? `Topic: "${topic}". Cover different aspects of this topic across the ${count} ${itemWord}. Vary the items. For example, present perfect should mix has/have, past participles, already/yet/just, for/since, and present perfect versus past simple. Do not test the same contrast every time.`
    : 'Choose useful grammar for this level. Vary the items. Each item should test a different point.';
  return `
You write English grammar exercises for learners around the world. Explanations use clear, simple English.
Level: ${request.level}.
Exercise: ${exerciseLabel(request.exercise)}.
Make exactly ${count} ${itemWord}.
${levelGuide(request.level, request.exercise)}
${topicLine}
${taskGuide(request.exercise, request.level)}
${c1BlankScenario(request, seed)}
${variationNote(request, seed)}
${options?.extra ?? ''}
Self-check every item before you keep it:
- Put the correct answer into the gap and read the whole sentence. It must be natural, idiomatic, and fully correct.
- Do not repeat a word. Bad: "only after the meeting _____ that I realized" with the answer "that", because that makes "that that".
- Do not mix tenses. Bad: "What _____ was a better sense" with the answer "is needed".
- Then try each wrong option in the same gap. Exactly one option may be correct. If a second option also sounds acceptable, change the sentence or the options.
- Do not offer two answers that both fit. Never offer both "is going to" and "will" when either sounds natural. Never offer both "is" and "was" after "The reason ... _____ because". Never offer both "could" and "might" when either is acceptable. Also avoid "has been postponed" and "had been postponed" when the sentence does not force one of them.
- In a relative clause, never offer both "that" and "who" for the same gap, and never offer both "which" and "that".
- Before finalizing each item, test every distractor in the gap; if any distractor is grammatical and natural in any common variety of English, replace it.
- After suggest, recommend, or insist, do not offer both a gerund and a that-clause or "we + verb". Bad: "She suggested _____ to the restaurant" with "going" and "we go", because both are correct.
- Do not offer more than one of "might have", "could have", "should have", and "ought to have" when the sentence allows both reproach and possibility. Bad: "You _____ told me you were struggling; I would have helped."
- In a cleft that starts with "It was" or "It is", do not offer more than one of "that", "which", and "who".
- Do not test present perfect against past simple with already, just, or yet when American English also accepts the past simple. Avoid that contrast, or make the wrong option clearly ungrammatical.
- Do not use the same correct answer twice in the set.
- Write the gap as exactly ${GAP}. One gap only.
- explanation is ONE short sentence. No line breaks.
- Do not prefix options or parts with A, B, C, or D.
${request.exercise === 'order' ? '' : '- Put the correct option in a different position from item to item. Do not leave it first every time.\n'}${shapeGuide(request.exercise)}
${correction ? `Fix these problems:\n${correction}` : ''}
Return only JSON.
`.trim();
}

const B1_FEATURED = [...BASIC_PHRASALS];
const B2_FEATURED = [...B2_PHRASALS];
const FEATURED_SAMPLE_MIN = 8;
const FEATURED_SAMPLE_SPAN = 5;
const C1_GROUP_MIN = 5;
const C1_GROUP_SPAN = 3;
const BLANKS_SAMPLE_MIN = 6;
const BLANKS_SAMPLE_SPAN = 5;

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** `min` to `min + span - 1` entries, chosen from the pool by the variation seed. */
function featuredSample(pool: readonly string[], seed: number, min: number, span: number): string[] {
  const stable = seed >>> 0;
  const count = Math.min(pool.length, min + (stable % span));
  return shuffleList(pool, randomFromSeed(stable)).slice(0, count);
}

/** 8 to 12 verbs, chosen from the level pool by the variation seed. */
function featuredPhrasals(pool: readonly string[], seed: number): string[] {
  return featuredSample(pool, seed, FEATURED_SAMPLE_MIN, FEATURED_SAMPLE_SPAN);
}

function c1VerbGroups(): { verb: string; phrases: string[] }[] {
  const byVerb = new Map<string, string[]>();
  for (const phrase of C1_PHRASALS) {
    const verb = phrase.split(' ')[0] ?? '';
    const phrases = byVerb.get(verb) ?? [];
    phrases.push(phrase);
    byVerb.set(verb, phrases);
  }
  return [...byVerb.entries()]
    .map(([verb, phrases]) => ({ verb, phrases: [...phrases].sort() }))
    .filter((entry) => entry.phrases.length >= 3)
    .sort((left, right) => left.verb.localeCompare(right.verb));
}

/**
 * 5 to 7 groups. Each group is three or four real particles of one verb,
 * so the model can copy them as the options instead of inventing a particle.
 */
function featuredC1Line(seed: number): string {
  const groups = c1VerbGroups();
  const stable = seed >>> 0;
  const count = Math.min(groups.length, C1_GROUP_MIN + (stable % C1_GROUP_SPAN));
  return shuffleList(groups, randomFromSeed(stable)).slice(0, count).map((group) => {
    const start = stable % group.phrases.length;
    const rotated = group.phrases.slice(start).concat(group.phrases.slice(0, start));
    return rotated.slice(0, 4).join(', ');
  }).join('; ');
}

/** 6 to 10 structures, chosen from the level pool by the variation seed. */
function featuredBlankTargets(pool: readonly string[], seed: number): string[] {
  return featuredSample(pool, seed, BLANKS_SAMPLE_MIN, BLANKS_SAMPLE_SPAN);
}

// Single-gap structures for fill-in-the-blank MCQs. Each name is one teachable target.
// Names stay free of commas and full stops so the prompt line can list them.
export const B1_BLANK_TARGETS = [
  'past simple with a finished time marker',
  'past continuous for an action in progress',
  'past simple versus past continuous',
  'present simple for habits',
  'present continuous for something happening now',
  'present continuous for a fixed arrangement',
  'present perfect for life experience',
  'present perfect with for',
  'present perfect with since',
  'present perfect versus past simple with a finished time',
  'going to for a plan already made',
  'will for a decision made while speaking',
  'zero conditional for general facts',
  'first conditional with if plus present simple',
  'used to for a past habit that stopped',
  'comparative adjectives with than',
  'superlative adjectives with the',
  'as plus adjective plus as',
  'too plus adjective',
  'adjective plus enough',
  'much versus many',
  'a few versus a little',
  'some versus any',
  'a or an before a singular countable noun',
  'the when the noun is already known',
  'no article for general plural nouns',
  'defining relative clause with who',
  'defining relative clause with which',
  'defining relative clause with where',
  'must for a personal obligation',
  'have to for an external rule',
  'should for advice',
  'can for present ability',
  'could for past ability',
  'preposition of time in',
  'preposition of time on',
  'preposition of time at',
  'preposition of place in on or at',
  'verb followed by a to-infinitive',
  'verb followed by a gerund',
  'so versus such',
  'there is versus there are',
  'something anything or nothing',
  'possessive apostrophe s',
  'whose in a question',
  'adverb of frequency before the main verb',
  'reflexive pronouns',
  'might for present possibility',
  'present simple passive',
  'past simple passive',
];

export const B2_BLANK_TARGETS = [
  'second conditional for an unreal present',
  'third conditional for an unreal past',
  'present perfect passive',
  'passive with a by phrase',
  'reported statements with backshift',
  'reported questions with if or whether',
  'reported commands with tell plus to-infinitive',
  'non-defining relative clause',
  'wish plus past simple for a present wish',
  'wish plus would for another person habit',
  'be used to plus gerund',
  'get used to plus gerund',
  'must for a present deduction',
  'cannot for a negative present deduction',
  'should have for past criticism',
  'past perfect for the earlier past event',
  'past perfect continuous',
  'present perfect continuous for duration until now',
  'future continuous',
  'future perfect with by',
  'causative have something done',
  'so that for purpose',
  'in order to for purpose',
  'although or even though',
  'despite plus a noun or gerund',
  'unless in a real conditional',
  'as long as',
  'in case for a precaution',
  'provided that',
  'neither nor',
  'so do I or neither do I',
  'question tag',
  'relative pronoun whose',
  'preposition plus a relative pronoun',
  'remember doing versus remember to do',
  'stop doing versus stop to do',
  'would rather plus the base verb',
  'had better',
  'it is time plus past simple',
  'indirect question word order',
  'must not versus do not have to',
  'make someone do something',
  'let someone do something',
  'the more the more',
  'so plus adjective plus that',
  'such a plus noun plus that',
  'was going to for a future in the past',
  'be supposed to',
  'was able to for a specific past success',
  'by the time plus past perfect',
  'whatever or whoever',
  'it is said that for a report',
  'a great deal of or plenty of',
  'prefer plus gerund or to-infinitive',
  'would rather someone did',
  'future in time clauses with the present simple',
];

export const C1_BLANK_TARGETS = [
  'cleft with it was and that',
  'cleft with what',
  'cleft with it was not until',
  'mixed conditional past cause and present result',
  'mixed conditional present cause and past result',
  'mandative subjunctive after it is essential that',
  'mandative subjunctive after demand that',
  'present participle clause giving a reason',
  'perfect participle with having plus past participle',
  'must have for a past deduction',
  'cannot have for a negative past deduction',
  'need not have for an unnecessary past action',
  'should have for past criticism with one modal only',
  'might have for past possibility with one modal only',
  'linker nevertheless',
  'linker whereas',
  'linker thereby plus participle',
  'wish plus past perfect',
  'if only plus past perfect',
  'would rather plus past about another person',
  'it is high time plus past simple',
  'as if plus past for an unreal comparison',
  'reduced relative clause',
  'which referring to the whole clause',
  'preposition before the relative pronoun',
  'reporting passive is believed to',
  'perfect infinitive is thought to have',
  'passive infinitive such as needs to be done',
  'but for plus a noun',
  'if it were not for',
  'given that',
  'with a view to plus gerund',
  'for fear of plus gerund',
  'in the event of',
  'on behalf of',
  'in light of',
  'with regard to',
  'as opposed to',
  'in terms of',
  'irrespective of',
  'result in versus result from',
  'adjective plus preposition aware of',
  'adjective plus preposition keen on',
  'noun plus preposition an increase in',
  'emphatic do does or did',
  'substitution with do so',
  'ellipsis so or not after hope or think',
  'collocation make a decision or do research',
  'hedging with appears to have',
  'future perfect continuous',
  'no matter how',
  'on condition that',
  'owing to',
  'accuse someone of plus gerund',
  'deny plus gerund',
  'object to plus gerund',
  'be bound to',
  'be on the point of plus gerund',
  'by means of',
  'in accordance with',
];

function blankPool(level: GrammarLevel): readonly string[] {
  if (level === 'C1') return C1_BLANK_TARGETS;
  if (level === 'B2') return B2_BLANK_TARGETS;
  return B1_BLANK_TARGETS;
}

function variationNote(request: GrammarRequest, seed: number): string {
  if (request.exercise === 'phrasal') {
    if (request.level === 'C1') {
      return `Variation seed ${seed}. Each item uses the phrases of one group below as its options. The correct answer must be one phrase from that group. A group of three needs a fourth option copied from a different group. Do not invent a particle. Include several of these in this set: ${featuredC1Line(seed)}. Do not repeat items from an earlier set.`;
    }
    const pool = request.level === 'B2' ? B2_FEATURED : B1_FEATURED;
    const featured = featuredPhrasals(pool, seed);
    return `Variation seed ${seed}. Use a fresh mix of phrasal verbs. Include several of these in this set: ${featured.join(', ')}. Do not repeat items from an earlier set.`;
  }
  if (request.exercise === 'blanks') {
    const featured = featuredBlankTargets(blankPool(request.level), seed);
    const line = `Include several of these structures or contrasts in this set: ${featured.join(', ')}. Do not repeat structures from an earlier set.`;
    if (request.level === 'C1') return line;
    return `Variation seed ${seed}. ${line}`;
  }
  return `Variation seed ${seed}. Vary the sentences so this set does not repeat an earlier one.`;
}

function usedSentences(items: GrammarItem[]): string[] {
  return items.map((item) => (item.kind === 'choice' ? item.prompt : item.chunks.join(' '))).slice(0, 8);
}

function exclusionNote(request: GrammarRequest, kept: GrammarItem[]): string {
  if (!kept.length) return '';
  const lines = [
    'These items are new. Do not repeat a sentence or a correct answer already used.',
    `Do not reuse these sentences: ${usedSentences(kept).join(' | ')}`,
  ];
  if (request.exercise === 'phrasal') {
    const verbs = [...new Set(kept.flatMap((item) => (item.kind === 'choice' ? [mainPhrasalVerb(item.options)] : [])))].filter(Boolean);
    if (verbs.length) lines.push(`Do not use these base verbs again: ${verbs.join(', ')}.`);
  } else {
    const answers = kept.flatMap((item) => (item.kind === 'choice' ? [item.correctAnswer] : []));
    if (answers.length) lines.push(`Do not use these correct answers again: ${answers.join(', ')}.`);
  }
  return lines.join('\n');
}

/** Ask only for the items still needed, leaving out verbs and sentences already kept. */
export function buildGrammarTopUpPrompt(
  request: GrammarRequest,
  needed: number,
  kept: GrammarItem[],
  correction?: string,
): string {
  return buildGrammarPrompt(request, correction, { count: needed, extra: exclusionNote(request, kept) });
}

function levelGuide(level: GrammarLevel, exercise: GrammarExerciseType): string {
  if (exercise === 'phrasal') {
    if (level === 'C1') return 'Use advanced but standard phrasal verbs. Each item must use at least three real particles of one verb, copied from one group named for this set. Do not invent a particle, and do not build four options for a verb that has only one, such as gloss over. Do not use basic B1 phrasal verbs at C1. "Put off a meeting", get up, look for, turn off, give up, and look after are too easy.';
    if (level === 'B2') return 'Use upper-intermediate phrasal verbs, the kind a B2 learner meets in work, study, and the news. Do not fill the set with basic B1 items such as get up, look for, and turn off.';
    return 'Use common everyday B1 phrasal verbs such as get up, look for, turn off, give up, and look after.';
  }
  if (exercise === 'order') {
    if (level === 'C1') return 'Prefer natural, idiomatic English. A paragraph must have exactly one possible order, shown by connectors, a pronoun that points back, or cause and effect. A single complex sentence split into chunks is a good item. Avoid awkward constructions.';
    if (level === 'B2') return 'Use B2 grammar in the paragraphs: conditionals, the passive, reported speech, or relative clauses. One logical order only. Vary the situation and the connectors.';
    return 'Write a short everyday paragraph in clear intermediate English. One logical order only. Vary the situation and the connectors.';
  }
  if (level === 'C1') return 'Vary the structure of every item in this set, and do not repeat the same patterns you used in earlier sets. Do not keep using Not only, What ... needs is, Had ... known, Little did, Never before, or Should you require. Draw on advanced grammar such as cleft sentences, mixed conditionals, the subjunctive, participle clauses, modal perfects, advanced linkers, and collocations, and use several of the structures named for this set. Prefer natural, idiomatic sentences. Avoid awkward constructions built only to show a rule.';
  if (level === 'B2') return 'Test a wide spread of upper-intermediate grammar, not the same few areas every time. Use several of the structures or contrasts named for this set. Add a time word or a reporting detail so only one option fits.';
  return 'Test a wide spread of B1 grammar, not the same few tenses every time. Use several of the structures or contrasts named for this set. Add a time word when the tense is what you are testing.';
}

const C1_SCENES = [
  'a delayed train and a missed meeting',
  'a scientist checking a surprising result',
  'neighbours sorting out a shared garden',
  'a journalist editing a difficult article',
  'two colleagues planning a product launch',
  'a nurse finishing a long night shift',
  'an architect reviewing a building plan',
  'friends organising a weekend away',
];

function c1BlankScenario(request: GrammarRequest, seed: number): string {
  if (request.level !== 'C1' || request.exercise !== 'blanks') return '';
  const scene = C1_SCENES[Math.floor(Math.random() * C1_SCENES.length)];
  return `Variation seed ${seed}. Write new sentences about this situation: ${scene}. Do not reuse textbook lines from earlier sets, such as "Hardly had I entered".`;
}

function taskGuide(exercise: GrammarExerciseType, level: GrammarLevel): string {
  if (exercise === 'order') {
    if (level === 'C1') {
      return 'Include both short paragraphs of 4 to 6 sentences and single complex sentences split into words or short phrases. chunks are the correct order. A paragraph has exactly one order because of connectors, pronoun references, or cause and effect. Use normal punctuation, and make the last part end with . ! or ?';
    }
    if (level === 'B1') {
      return 'Each item is a different short paragraph of 4 to 6 full sentences. Each piece must start with a capital letter, end with . ! or ?, and still make sense on its own. Joined in order, the steps must read naturally. Do not use a fragment such as "until the crust was golden brown" as its own piece. Do not repeat the same scene, such as a morning routine, cooking, or the airport. Vary the connectors. Do not always use First, Then, After that, and Finally. Use because, once, when, after, before, meanwhile, as soon as, or later. Use "so" only for a result, not for a simple next step.';
    }
    return 'Each item is a different short paragraph of 4 to 6 sentences or clauses. Do not repeat the same scene, such as a morning routine, cooking, or the airport. Vary the connectors. Do not always use First, Then, After that, and Finally. Use because, once, when, after, before, meanwhile, as soon as, or later. Use "so" only for a result, not for a simple next step. Do not split one sentence into adverbials that could go in more than one place. The last part ends with . ! or ?';
  }
  if (exercise === 'phrasal') {
    return 'Each prompt is one natural sentence with exactly one gap written as _____. Every option must be a real phrasal verb. Do not invent particles. Bad: "gloss up", "dream off". Good: "gloss over", "dream up". Use either at least three options with the same verb and different real particles, or two options with the same verb plus two other real phrasal verbs. Four real particles of the same verb is best, such as put off, put up, put out, and put on. Use each base verb in at most two items. Exactly one option may be the natural answer. Do not offer two particles that both fit, such as "call in" and "call up" for reservists, or "work out" and "work through" for details. Never use a single-word verb such as "shelve". Never use near-synonyms such as make out and catch on to, go over and iron out, or speak to and tell off.';
  }
  return 'Each prompt is one natural sentence with exactly one gap written as _____. The 4 options are single words or short phrases. Wrong options must be clearly wrong in this sentence, in British and American English. Do not pair "will" with "is going to" or "are going to". Do not make an item from degree adverbs such as somewhat, slightly, rather, fairly, quite, pretty, or a bit. Do not pair "going to" with "will", or two tenses that both fit. After suggest, recommend, or insist, do not offer both a gerund and a that-clause. Do not offer two modal perfects such as "might have" and "should have" unless the sentence forces one. A cleft starting "It was" or "It is" must not offer two of "that", "which", and "who".';
}

function shapeGuide(exercise: GrammarExerciseType): string {
  if (exercise === 'order') {
    return 'JSON shape: {"items":[{"prompt":"Put these parts in order.","chunks":["first","second","third","fourth"],"explanation":"One short sentence."}]}';
  }
  return 'JSON shape: {"items":[{"prompt":"She _____ home yesterday.","options":["goes","went","go","going"],"correctAnswer":"went","explanation":"Yesterday needs the past simple."}]}';
}

/** Fisher-Yates. `random` returns a number in [0, 1). */
function shuffleList<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

/**
 * Spread the correct option across the choices.
 * correctAnswer stays the option text, so its letter is its index after the shuffle.
 */
export function shuffleChoiceOptions(item: GrammarChoice, random: () => number = Math.random): GrammarChoice {
  const options = shuffleList(item.options, random);
  const correctAnswer = options.find((option) => option.toLowerCase() === item.correctAnswer.toLowerCase()) ?? item.correctAnswer;
  return { ...item, options, correctAnswer };
}

/** Shuffle parts so the learner does not see the correct order. */
export function shuffleChunks(chunks: string[], random: () => number = Math.random): GrammarChunk[] {
  const items = shuffleList(chunks.map((text, index) => ({ id: `c${index}`, text })), random);
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
