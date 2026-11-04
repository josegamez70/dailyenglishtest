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
const MIN_ITEMS = 6;

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

const REAL_PHRASALS = new Set(`
look after, look for, look up, look into, look out, look around, look forward to, look down on, look up to,
give up, give back, give in, give away, give out,
put off, put on, put away, put out, put up, put back, put down, put through, put up with,
take off, take up, take on, take over, take back, take in, take after, take apart, take out,
turn off, turn on, turn up, turn down, turn out, turn around, turn into,
break down, break up, break in, break out, break off,
come back, come in, come across, come on, come out, come up with, come down to,
get up, get on, get off, get over, get back, get out, get in, get away, get along, get rid of,
go out, go back, go on, go over, go through, go away, go along with,
run out, run into, run off, run out of,
call off, call back, call for, call in, call up, call out,
work out, work on, work through, work up,
bring up, bring back, bring about, bring in,
carry on, carry out, set up, set off, set out, set about,
make up, make out, make up for, pick up, figure out, find out, fill in, fill out, sort out,
show up, end up, grow up, hold on, hold up, keep up, keep on, point out,
check out, check in, drop off, drop out, hand in, hand out, hang up, hang on,
pass out, pay back, pull off, pull over, iron out, gloss over, dream up,
speak up, stand up, stand for, stick to, think over, think through, try on, try out,
wake up, wear out, write down, write off, catch up, catch on, fall out, fall through, fall over,
cut off, cut down, let down, live on, mix up, rule out, back up, blow up, calm down, count on, deal with
`.split(',').map((item) => item.trim()).filter(Boolean));

function verbBases(token: string): string[] {
  const word = token.toLowerCase();
  const bases = new Set<string>([word]);
  const irregular: Record<string, string> = {
    got: 'get', gets: 'get', getting: 'get',
    went: 'go', goes: 'go', going: 'go', gone: 'go',
    took: 'take', takes: 'take', taking: 'take', taken: 'take',
    came: 'come', comes: 'come', coming: 'come',
    ran: 'run', runs: 'run', running: 'run',
    broke: 'break', breaks: 'break', breaking: 'break', broken: 'break',
    gave: 'give', gives: 'give', giving: 'give', given: 'give',
    made: 'make', makes: 'make', making: 'make',
    puts: 'put', putting: 'put',
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

function isRealPhrasal(option: string): boolean {
  const words = wordsOf(option);
  let start = 0;
  while (start < words.length && AUXILIARIES.has(words[start])) start += 1;
  const core = words.slice(start);
  if (core.length < 2) return false;
  const rest = core.slice(1).join(' ');
  return verbBases(core[0]).some((verb) => REAL_PHRASALS.has(`${verb} ${rest}`));
}

function phrasalGroupProblem(options: string[]): string | null {
  if (options.some((option) => !option.includes(' ') || !isRealPhrasal(option))) {
    return 'Every option must be a real phrasal verb, such as "put off" or "gloss over". Do not invent one like "gloss up" or "dream off", and do not use a single-word verb.';
  }
  const counts = new Map<string, number>();
  for (const verb of options.map(optionVerb)) counts.set(verb, (counts.get(verb) ?? 0) + 1);
  const most = Math.max(...counts.values());
  if (most < 3) {
    return 'Use at least three options with the same verb and different real particles. The fourth may be another real phrasal verb with an unrelated meaning.';
  }
  return null;
}

function mainPhrasalVerb(options: string[]): string {
  const counts = new Map<string, number>();
  for (const verb of options.map(optionVerb)) counts.set(verb, (counts.get(verb) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? '';
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

/** Turn a Gemini grammar payload into a set of about 10 playable items. */
export function normalizeGrammarSet(raw: unknown, request: GrammarRequest): { ok: true; set: GrammarSet } | { ok: false; problems: string[] } {
  const rows = readRawItems(raw);
  if (!rows) return { ok: false, problems: ['Return a JSON object with an items array.'] };
  const items: GrammarItem[] = [];
  const problems: string[] = [];
  const seenAnswers = new Set<string>();
  const verbCounts = new Map<string, number>();
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
    if (request.exercise === 'phrasal' && checked.item.kind === 'choice') {
      const verb = mainPhrasalVerb(checked.item.options);
      if ((verbCounts.get(verb) ?? 0) >= 2) {
        problems.push('Use each base verb in at most two items.');
        continue;
      }
      verbCounts.set(verb, (verbCounts.get(verb) ?? 0) + 1);
    }
    seenAnswers.add(answerKey);
    items.push(checked.item);
    if (items.length === GRAMMAR_ITEM_COUNT) break;
  }
  if (items.length < MIN_ITEMS) {
    const summary = `Only ${items.length} exercises were usable. Need at least ${MIN_ITEMS}.`;
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
${c1BlankScenario(request)}
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
    if (level === 'C1') return 'Prefer natural, idiomatic English. A paragraph must have exactly one possible order, shown by connectors, a pronoun that points back, or cause and effect. A single complex sentence split into chunks is a good item. Avoid awkward constructions.';
    if (level === 'B2') return 'Use B2 grammar in the paragraphs: conditionals, the passive, reported speech, or relative clauses. One logical order only. Vary the situation and the connectors.';
    return 'Write a short everyday paragraph in clear intermediate English. One logical order only. Vary the situation and the connectors.';
  }
  if (level === 'C1') return 'Vary the structure of every item in this set, and do not repeat the same patterns you used in earlier sets. Do not keep using Not only, What ... needs is, Had ... known, Little did, Never before, or Should you require. Include cleft sentences, mixed conditionals, the subjunctive, participle clauses, modal perfects, advanced linkers, and collocations. Prefer natural, idiomatic sentences. Avoid awkward constructions built only to show a rule.';
  if (level === 'B2') return 'Test conditionals, the passive, reported speech, and other upper-intermediate grammar. Add a time word or a reporting detail so only one option fits.';
  return 'Test B1 grammar such as present and past tenses, the present perfect, going to, and common prepositions. Add a time word when the tense is what you are testing.';
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

function c1BlankScenario(request: GrammarRequest): string {
  if (request.level !== 'C1' || request.exercise !== 'blanks') return '';
  const scene = C1_SCENES[Math.floor(Math.random() * C1_SCENES.length)];
  const seed = Math.floor(Math.random() * 10000);
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
    return 'Each prompt is one natural sentence with exactly one gap written as _____. Every option must be a real phrasal verb. Do not invent particles. Bad: "gloss up", "dream off". Good: "gloss over", "dream up". Prefer four real particles of the same verb, such as put off, put up, put out, and put on. If that verb does not have four real particles, use three real ones plus one other real phrasal verb whose meaning cannot fit the sentence. Use each base verb in at most two items. Do not offer two particles that both fit, such as "call in" and "call up" for reservists, or "work out" and "work through" for details. Never use a single-word verb such as "shelve". Never use near-synonyms such as make out and catch on to, go over and iron out, or speak to and tell off.';
  }
  return 'Each prompt is one natural sentence with exactly one gap written as _____. The 4 options are single words or short phrases. Wrong options must be clearly wrong in this sentence, in British and American English. Do not pair "will" with "is going to" or "are going to". Do not make an item from degree adverbs such as somewhat, slightly, rather, fairly, quite, pretty, or a bit. Do not pair "going to" with "will", or two tenses that both fit. After suggest, recommend, or insist, do not offer both a gerund and a that-clause. Do not offer two modal perfects such as "might have" and "should have" unless the sentence forces one. A cleft starting "It was" or "It is" must not offer two of "that", "which", and "who".';
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
