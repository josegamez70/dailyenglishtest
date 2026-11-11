import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { TOPICS, WILDCARD_TOPIC } from '../constants';
import {
  advancedSkillsAreChallenging,
  closestStorySentence,
  countWords,
  hasNearSynonymDistractor,
  normalizeQuestionSkill,
  optionsAreDistinct,
  questionGivesAwayAnswer,
  sentenceInStory,
  wordCountBounds,
  type QuestionSkill,
} from '../lessonUtils';
import {
  FEMALE_NAMES,
  dialogueTurnPlan,
  dialogueSpeakers,
  normalizeFormat,
  pickDialogueSpeakers,
  speakersWithGender,
  parseDialogue,
  renderDialogue,
  spokenWordCount,
  trimDialogueToLength,
  type ContentFormat,
  type DialogueSpeaker,
  type DialogueTurn,
  type SpeakerGender,
} from '../dialogue';
import { normalizeQuiz, type NormalizedQuizQuestion } from '../quizNormalize';
import {
  buildGrammarPrompt,
  buildGrammarTopUpPrompt,
  GRAMMAR_GENERATION_COUNT,
  GRAMMAR_ITEM_COUNT,
  GRAMMAR_MIN_ITEMS,
  grammarExercise,
  grammarLevel,
  normalizeGrammarSet,
  type GrammarExerciseType,
  type GrammarItem,
  type GrammarRequest,
  type GrammarSet,
} from '../grammarSet';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildListeningSsml, synthesizeNeuralMp3 } from '../azureSpeech.ts';
import {
  grammarUsesBank,
  isListeningFormat,
  isListeningLevel,
  isListeningQuestionCount,
  isListeningWordCount,
  listeningBankQuery,
} from '../exerciseBank.ts';
import {
  claimGrammarFromBank,
  claimListeningFromBank,
  releaseGrammarBankItem,
  signListeningAudio,
} from '../exerciseBankServer.ts';
import { readHttpStatus, runModelLoop, type ModelAttemptFailure } from '../modelFallback';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
};

type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export type LessonParams = {
  level: string;
  topic: string;
  wordCount: number;
  questionCount: number;
  vocabularyCount: number;
  mode: 'reading' | 'listening';
  format: ContentFormat;
  speakers: { name: string; gender: SpeakerGender }[];
  surprise: boolean;
  stage: 'story' | 'quiz';
  sourceStory: string;
  /** Typed on the Listening page. Empty means the topic list is the bank key. */
  customTopic?: string;
  /** Topic value from the list, before a wildcard is turned into a concrete label. */
  listTopic?: string;
  /** The exercise bank retries until the lesson has no validation problems. Live lessons do not. */
  strict?: boolean;
};

type VocabularyItem = { word: string; definition: string };

type PreparedLesson = {
  story: string;
  quiz: NormalizedQuizQuestion[];
  vocabulary: VocabularyItem[];
  problems: string[];
  wordCount: number;
  wordCountOk: boolean;
  dialogue: DialogueTurn[];
};

// One warm function instance remembers a 404 so later steps do not call that model.
// 2.0 and 2.5 Flash are not used for normal lessons. 2.5 Flash-Lite is only the
// single fallback when the primary models are overloaded or time out.
const MODEL_CANDIDATES = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'];
const unavailableModels = new Set<string>([
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash',
]);
let preferredModel = 'gemini-3-flash-preview';

function modelsToTry(): string[] {
  const alive = MODEL_CANDIDATES.filter((name) => !unavailableModels.has(name));
  if (alive.includes(preferredModel)) {
    return [preferredModel, ...alive.filter((name) => name !== preferredModel)];
  }
  return alive;
}

function thinkingConfigFor(modelName: string): { thinkingBudget?: number; thinkingLevel?: string } {
  // 2.5 is not called. thinkingBudget 0 is valid on 3.1 but did not finish in time.
  if (modelName.includes('2.5')) return { thinkingBudget: 0 };
  if (modelName.includes('3.8')) return { thinkingLevel: 'low' };
  return { thinkingLevel: 'minimal' };
}

const LESSON_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    story: {
      type: SchemaType.STRING,
      description: 'The text or the dialogue written as lines. No title and no word count.',
    },
    dialogue: {
      type: SchemaType.ARRAY,
      description: 'Dialogue turns. Empty for a Text lesson. Two women with different names. The first woman speaks first.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          speaker: { type: SchemaType.STRING, description: 'A short first name.' },
          gender: { type: SchemaType.STRING, description: 'female. Both speakers are women.' },
          line: { type: SchemaType.STRING, description: 'What that person says. Do not include the name.' },
        },
        required: ['speaker', 'gender', 'line'],
      },
    },
    quiz: {
      type: SchemaType.ARRAY,
      description: 'Comprehension questions. Each has one clearly correct answer.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          question: { type: SchemaType.STRING },
          options: {
            type: SchemaType.ARRAY,
            description: 'Exactly 4 plain answers. Do not prefix them with A., B), (C), or "A ".',
            minItems: 4,
            maxItems: 4,
            items: { type: SchemaType.STRING },
          },
          correctAnswer: {
            type: SchemaType.STRING,
            description: 'The full text of the correct option, copied exactly. Not a letter.',
          },
          explanation: {
            type: SchemaType.STRING,
            description: 'One or two short sentences in simple English explaining why that option is correct.',
          },
          supportingSentence: {
            type: SchemaType.STRING,
            description: 'One sentence copied exactly from the story that supports the answer.',
          },
          skill: {
            type: SchemaType.STRING,
            description: 'detail, inference, vocabulary, or intent. Advanced quizzes are mostly inference, vocabulary, or intent.',
          },
        },
        required: ['question', 'options', 'correctAnswer', 'explanation', 'supportingSentence', 'skill'],
      },
    },
    vocabulary: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          word: { type: SchemaType.STRING },
          definition: { type: SchemaType.STRING, description: 'A short definition in simple English.' },
        },
        required: ['word', 'definition'],
      },
    },
  },
  required: ['story', 'quiz', 'vocabulary'],
};

function grammarSchema(exercise: GrammarExerciseType, count: number): ResponseSchema {
  const choice = exercise !== 'order';
  return {
    type: SchemaType.OBJECT,
    properties: {
      items: {
        type: SchemaType.ARRAY,
        description: choice
          ? `${count} grammar items. Each sentence has one gap and four options.`
          : `${count} order items. chunks are already in the correct order.`,
        minItems: 1,
        maxItems: count,
        items: choice
          ? {
            type: SchemaType.OBJECT,
            properties: {
              prompt: { type: SchemaType.STRING, description: 'One sentence with the gap written as _____.' },
              options: {
                type: SchemaType.ARRAY,
                minItems: 4,
                maxItems: 4,
                items: { type: SchemaType.STRING },
              },
              correctAnswer: { type: SchemaType.STRING, description: 'The correct option, copied exactly from options. Not a letter. It may be any of the four options, not always the first.' },
              explanation: { type: SchemaType.STRING, description: 'One short sentence in simple English.' },
            },
            required: ['prompt', 'options', 'correctAnswer', 'explanation'],
          }
          : {
            type: SchemaType.OBJECT,
            properties: {
              prompt: { type: SchemaType.STRING, description: 'A short instruction, such as Put these parts in order.' },
              chunks: {
                type: SchemaType.ARRAY,
                description: '4 to 6 parts in the correct order.',
                minItems: 4,
                maxItems: 6,
                items: { type: SchemaType.STRING },
              },
              explanation: { type: SchemaType.STRING, description: 'One short sentence in simple English.' },
            },
            required: ['prompt', 'chunks', 'explanation'],
          },
      },
    },
    required: ['items'],
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

const FREE_LESSON_LIMIT = 3;

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(event: HandlerEvent): string | null {
  const headers = event.headers ?? {};
  const raw = headers.authorization || headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

type LessonAllowance = { allowed: boolean; lessonsUsed: number; plan: string; reason: string };

function readAllowance(data: unknown): LessonAllowance | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.allowed !== 'boolean') return null;
  return {
    allowed: record.allowed,
    lessonsUsed: Number(record.lessons_used ?? 0),
    plan: String(record.plan ?? 'free'),
    reason: typeof record.reason === 'string' ? record.reason : '',
  };
}

function limitBody(lessonsUsed: number, plan: string) {
  return JSON.stringify({
    ok: false,
    error: 'free_limit',
    lessonsUsed,
    plan,
    message: 'You have used your 3 free lessons. Premium is 3 € per month. These 3 lessons do not expire.',
  });
}

function pilotExpiredBody() {
  return JSON.stringify({
    ok: false,
    error: 'pilot_expired',
    message: 'This academy pilot has ended. Saved lessons and progress are still available. New lessons are paused. Academy up to 20 students is 30 € per month, 21% VAT included. No payment was started.',
  });
}

function pickApiKey() {
  return (
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_API_KEY ||
    process.env.GENAI_API_KEY
  );
}

function levelRules(level: string): string {
  const key = level.toLowerCase();
  if (key.includes('advanced')) {
    return [
      'Level: Advanced.',
      'Use richer vocabulary and longer sentences, but stay clear.',
      'A majority of the questions must require thinking, not copying a fact.',
      'Most questions must use skill "inference" (a conclusion the story supports but does not say in one sentence), "vocabulary" (what a word or phrase means in THIS story), or "intent" (why the writer included a detail, or what the writer wants the reader to think).',
      'Simple fact questions, skill "detail", must be the minority.',
      'Each question still has exactly one answer. A careful reader must not be able to defend a second option.',
      'Do not use a near-synonym of the right idea as a wrong answer. If the story supports "fairly", do not also offer "equitably" or any wording that could also be correct.',
      'The question must not contain the correct answer or repeat its key words. Bad example: asking which field uses artificial intelligence and then answering "Artificial intelligence".',
    ].join(' ');
  }
  if (key.includes('intermediate')) {
    return [
      'Level: Intermediate.',
      'Use everyday English with some less common words.',
      'Mix fact questions (skill "detail") with some inference questions (skill "inference"). Do not make every question a line copied from the story.',
      'Each question has exactly one correct answer that a careful reader can defend, and the other options cannot.',
      'Do not use near-synonyms as distractors. Wrong answers must be clearly different ideas, not another wording of the right idea.',
      'The question must not contain the correct answer or give it away.',
    ].join(' ');
  }
  return [
    'Level: Beginner.',
    'Use short sentences and common words.',
    'Ask simple questions about facts the story states: who, what, where, and when.',
    'Each question has exactly one correct answer.',
    'Wrong answers must be clearly different.',
  ].join(' ');
}

function formatRules(format: ContentFormat, speakers: { name: string; gender: SpeakerGender }[]): string {
  if (format === 'dialogue') {
    const [first, second] = speakers;
    const firstName = first?.name ?? 'Anna';
    const secondName = second?.name && second.name !== firstName ? second.name : 'Sophie';
    return [
      'FORMAT: Dialogue.',
      `Write a conversation between exactly these two women: ${firstName} and ${secondName}.`,
      'They must have different names.',
      `${firstName} is the first speaker. ${secondName} is the second speaker.`,
      `speaker must be exactly "${firstName}" or "${secondName}".`,
      'Return a dialogue array. Each item has speaker, gender, and line.',
      'gender for both speakers is female.',
      'Do not put the name inside line.',
      `Also set story to the same dialogue, one turn per line, like "${firstName}: Hello."`,
      'Count only the words inside line. Do not count the speaker names.',
      'Do not write Character 1, Character 2, Person 1, Person 2, or any other name.',
    ].join(' ');
  }
  return [
    'FORMAT: Text.',
    'Write one narrative or one monologue. Do not write a dialogue and do not add speaker names.',
    'Use 1 to 3 short paragraphs. Do not add a title.',
  ].join(' ');
}

function modeRules(mode: 'reading' | 'listening'): string {
  if (mode === 'listening') {
    return 'The learner will HEAR the story and will not see it during the quiz. Do not mention paragraphs, lines, pages, or spelling. Questions must be answerable from listening.';
  }
  return 'The learner will READ the story and then answer from memory. Questions must be answerable from the story alone. Do not mention paragraph numbers.';
}

function concreteTopic(raw: unknown): { label: string; surprise: boolean } {
  const value = String(raw ?? '').trim();
  const lower = value.toLowerCase();
  if (!value || lower === WILDCARD_TOPIC || lower === 'any topic') {
    const pool = TOPICS.filter((topic) => topic.value !== WILDCARD_TOPIC);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { label: pick.label, surprise: true };
  }
  const byValue = TOPICS.find((topic) => topic.value === value);
  if (byValue && byValue.value !== WILDCARD_TOPIC) return { label: byValue.label, surprise: false };
  const byLabel = TOPICS.find((topic) => topic.label.toLowerCase() === lower);
  if (byLabel && byLabel.value !== WILDCARD_TOPIC) return { label: byLabel.label, surprise: false };
  return { label: value, surprise: false };
}

function storyLevelRules(level: string): string {
  const key = level.toLowerCase();
  if (key.includes('advanced')) return 'Level: Advanced. Use richer vocabulary and longer sentences, but stay clear.';
  if (key.includes('intermediate')) return 'Level: Intermediate. Use everyday English with some less common words.';
  return 'Level: Beginner. Use short sentences and common words.';
}

function buildPrompt(params: LessonParams, corrective?: string): string {
  return params.stage === 'quiz' ? buildQuizPrompt(params, corrective) : buildStoryPrompt(params, corrective);
}

function buildStoryPrompt(params: LessonParams, corrective?: string): string {
  const { min, max } = wordCountBounds(params.wordCount);
  const topic = params.topic.replace(/["\n\r]/g, ' ').trim();
  const correction = corrective
    ? `\n\nThe previous attempt was rejected. Fix every problem below, then return a new JSON object:\n${corrective}\n`
    : '';
  return `
You write English learning materials. Use clear, natural English.
Write one ${params.mode} ${params.format} on this topic only: ${topic}.
Do not write about the words "wildcard" or "any topic".

${storyLevelRules(params.level)}
${formatRules(params.format, params.speakers)}

${params.format === 'dialogue'
    ? `LENGTH: write exactly ${dialogueTurnPlan(params.wordCount).turns} turns and then stop. Each spoken line is about ${dialogueTurnPlan(params.wordCount).wordsPerTurn} words, even at Advanced level. Spoken words must total about ${params.wordCount} (between ${min} and ${max}). Do not count the names. Do not add another turn.`
    : `LENGTH: the text must be between ${min} and ${max} words (target ${params.wordCount}). A contraction such as "don't" is one word. Count the words in the text only.`}

VOCABULARY: exactly ${params.vocabularyCount} useful words or short phrases that appear in the text. definition is one short explanation in simple English.

Return ONLY JSON with story, dialogue, and vocabulary. No quiz. No markdown.
${correction}
`.trim();
}

function buildQuizPrompt(params: LessonParams, corrective?: string): string {
  const correction = corrective
    ? `\n\nThe previous attempt was rejected. Fix every problem below, then return a new JSON object:\n${corrective}\n`
    : '';
  return `
You write quiz questions about a story the student already has. Do not rewrite the story.

STORY:
${params.sourceStory}

${levelRules(params.level)}
${modeRules(params.mode)}
${params.format === 'dialogue' ? `In the questions, use ${params.speakers[0]?.name ?? 'the first woman'} and ${params.speakers[1]?.name ?? 'the second woman'} exactly as they appear in the story.` : ''}

QUIZ:
- Exactly ${params.questionCount} questions about the story above.
- Each question has exactly 4 options and exactly one correct answer.
- Option text must NOT start with a letter label. Never write "A.", "A)", "(A)", "A:", "A-", or a lone "A ", "B ", "C ", or "D " in front of an answer.
- correctAnswer must be the full text of the one correct option, copied exactly from options.
- Wrong answers must be clearly different ideas, not near-copies or near-synonyms of the right idea.
- The question text must NOT contain the correct answer or its key words.
- Do not use "all of the above" or "none of the above".
- skill: "detail", "inference", "vocabulary", or "intent".
- explanation: one short sentence in simple English.
- supportingSentence: copy ONE full sentence from the story, exactly as written.

Return ONLY this JSON shape. No markdown.
{"quiz":[{"question":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","supportingSentence":"...","skill":"detail"}]}
${correction}
`.trim();
}

function parseModelJson(rawText: string): Record<string, unknown> | null {
  const clean = rawText.replace(/```json|```/gi, '').trim();
  const candidates = [clean];
  const objStart = clean.indexOf('{');
  const objEnd = clean.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) candidates.push(clean.slice(objStart, objEnd + 1));
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(clean.slice(arrStart, arrEnd + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
      if (Array.isArray(parsed)) return { quiz: parsed };
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* try the next slice */
    }
  }
  return null;
}

function prepareLesson(parsed: Record<string, unknown>, params: LessonParams): PreparedLesson {
  const quizStage = params.stage === 'quiz';
  let story = quizStage ? params.sourceStory : (typeof parsed.story === 'string' ? parsed.story.trim() : '');
  let dialogue: DialogueTurn[] = [];
  if (params.format === 'dialogue') {
    const fromField = quizStage ? [] : parseDialogue(parsed.dialogue, params.speakers);
    const fromStory = parseDialogue(story, params.speakers);
    const base = fromField.length >= fromStory.length ? fromField : fromStory;
    const genders = new Map<string, DialogueTurn['gender']>();
    for (const turn of [...fromStory, ...fromField]) {
      if (turn.gender) genders.set(turn.speaker.toLowerCase(), turn.gender);
    }
    dialogue = base.map((turn) => ({
      ...turn,
      gender: genders.get(turn.speaker.toLowerCase()) ?? turn.gender,
    }));
    if (!quizStage && dialogue.length) {
      dialogue = trimDialogueToLength(dialogue, params.wordCount);
    }
    if (dialogue.length) story = renderDialogue(dialogue);
  }
  const quizSource = Array.isArray(parsed.quiz)
    ? parsed.quiz
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : [];
  const quiz = quizStage ? normalizeQuiz(quizSource) : [];
  const problems: string[] = [];
  const wordCount = params.format === 'dialogue' ? spokenWordCount(dialogue) : countWords(story);
  const { min, max } = wordCountBounds(params.wordCount);
  const wordCountOk = wordCount >= min && wordCount <= max;

  if (!quizStage && !story) problems.push('The story is missing.');
  if (!quizStage && params.format === 'dialogue') {
    const speakers = dialogueSpeakers(dialogue);
    if (speakers.length !== 2) {
      problems.push('Use exactly 2 speakers. Give each speaker a short name and let both of them speak.');
    }
    if (dialogue.length < 4) {
      problems.push('Write at least 4 dialogue turns. Each turn is one speaker and one line.');
    }
    const allowed = new Set(params.speakers.map((speaker) => speaker.name.toLowerCase()));
    const used = dialogueSpeakers(dialogue).map((name) => name.toLowerCase());
    const samePeople = used.length === allowed.size && used.every((name) => allowed.has(name));
    if (!samePeople) {
      const cast = params.speakers.map((speaker) => `${speaker.name} (${speaker.gender})`).join(' and ');
      problems.push(`Use only these two speakers: ${cast}. Do not invent other names.`);
    }
    if (speakersWithGender(dialogue).some((speaker) => !speaker.gender)) {
      problems.push('Every speaker must be one of the named people given for this dialogue.');
    }
    const firstSpeaker = params.speakers[0];
    const secondSpeaker = params.speakers[1];
    if (firstSpeaker && dialogue[0] && dialogue[0].speaker.toLowerCase() !== firstSpeaker.name.toLowerCase()) {
      problems.push(`${firstSpeaker.name} must speak first. ${secondSpeaker?.name ?? 'The other woman'} speaks second. Both speakers are women with different names.`);
    }
  }
  if (!quizStage && !wordCountOk) {
    problems.push(
      params.format === 'dialogue'
        ? `The spoken lines are ${wordCount} words. Rewrite them so they are between ${min} and ${max} words (target ${params.wordCount}). Do not count the names.`
        : `The story is ${wordCount} words. Rewrite it so it is between ${min} and ${max} words (target ${params.wordCount}).`
    );
  }
  if (quizStage && quiz.length !== params.questionCount) {
    problems.push(`Write exactly ${params.questionCount} questions. You wrote ${quiz.length}.`);
  }

  const rawQuiz = Array.isArray(parsed.quiz) ? parsed.quiz : [];
  const skills: Array<QuestionSkill | null> = [];

  if (quizStage) quiz.forEach((question, index) => {
    const number = index + 1;
    if (!question.question) problems.push(`Question ${number} is missing its question text.`);
    if (question.options.length !== 4) {
      problems.push(`Question ${number} must have exactly 4 options.`);
    }
    if (question.options.some((option) => !option)) {
      problems.push(`Question ${number} has an empty option.`);
    }
    const unique = new Set(question.options.map((option) => option.toLowerCase()));
    if (unique.size !== question.options.length) {
      problems.push(`Question ${number} has two options that say the same thing.`);
    }
    if (!question.options.includes(question.correctAnswer)) {
      problems.push(
        `Question ${number}: correctAnswer must be copied exactly from one of the four options, with no letter prefix.`
      );
    }
    if (question.options.length >= 2 && !optionsAreDistinct(question.options)) {
      problems.push(
        `Question ${number}: the options are too similar. Rewrite the wrong answers so each one is a clearly different idea, and only one can be correct.`
      );
    }
    if (!question.explanation) {
      problems.push(`Question ${number} needs a short explanation of why the answer is correct.`);
    }
    if (!question.supportingSentence) {
      problems.push(`Question ${number} needs supportingSentence: one sentence copied from the story.`);
    } else if (story && !sentenceInStory(question.supportingSentence, story)) {
      const snapped = closestStorySentence(question.supportingSentence, story);
      if (snapped) question.supportingSentence = snapped;
      else {
        problems.push(
          `Question ${number}: supportingSentence must be copied exactly from the story.`
        );
      }
    }
    const rawItem = rawQuiz[index];
    const rawRecord = rawItem && typeof rawItem === 'object' ? (rawItem as Record<string, unknown>) : {};
    skills.push(normalizeQuestionSkill(rawRecord.skill));
    if (
      question.question &&
      question.correctAnswer &&
      questionGivesAwayAnswer(question.question, question.correctAnswer)
    ) {
      problems.push(
        `Question ${number}: the question repeats the correct answer. Rewrite the question so it does not contain the answer or its key words.`
      );
    }
    if (question.options.length >= 2 && hasNearSynonymDistractor(question.options)) {
      problems.push(
        `Question ${number}: two options mean almost the same thing. Replace the extra one with a clearly different idea.`
      );
    }
  });

  if (
    quizStage &&
    params.level.toLowerCase().includes('advanced') &&
    quiz.length > 0 &&
    !advancedSkillsAreChallenging(skills)
  ) {
    problems.push(
      'Most Advanced questions must be inference, vocabulary, or intent. Detail questions must be the minority. Set skill on every question.'
    );
  }

  const vocabulary: VocabularyItem[] = Array.isArray(parsed.vocabulary)
    ? parsed.vocabulary
        .map((item) => {
          const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          return {
            word: String(record.word ?? '').trim(),
            definition: String(record.definition ?? '').trim(),
          };
        })
        .filter((item) => item.word && item.definition)
    : [];

  if (!quizStage && vocabulary.length < Math.min(4, params.vocabularyCount)) {
    problems.push(`Include ${params.vocabularyCount} vocabulary items from the story.`);
  }

  return { story, quiz, vocabulary, problems, wordCount, wordCountOk, dialogue };
}

function lessonScore(lesson: PreparedLesson, params: LessonParams): number {
  let score = lesson.problems.length === 0 ? 100 : 0;
  score -= lesson.problems.length * 8;
  if (lesson.wordCountOk) score += 40;
  else score -= Math.min(30, Math.abs(lesson.wordCount - params.wordCount) / 2);
  if (lesson.quiz.length === params.questionCount) score += 20;
  const answered = lesson.quiz.filter(
    (question) =>
      question.options.length === 4 &&
      question.options.includes(question.correctAnswer) &&
      question.explanation &&
      question.supportingSentence
  ).length;
  score += answered * 3;
  return score;
}

function extractText(result: { response?: { text?: () => string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } }): string {
  if (typeof result.response?.text === 'function') return result.response.text();
  return result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callModel(
  apiKey: string,
  modelName: string,
  prompt: string,
  timeoutMs: number,
  useSchema: boolean,
  useThinkingOff = true,
  maxOutputTokens = 8192,
  schema?: ResponseSchema,
  temperature?: number,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const generationConfig: {
    maxOutputTokens: number;
    responseMimeType: string;
    responseSchema?: ResponseSchema;
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string };
    temperature?: number;
  } = {
    maxOutputTokens,
    responseMimeType: 'application/json',
  };
  if (useThinkingOff) {
    generationConfig.thinkingConfig = thinkingConfigFor(modelName);
  }
  if (typeof temperature === 'number') generationConfig.temperature = temperature;
  if (schema) generationConfig.responseSchema = schema;
  else if (useSchema) generationConfig.responseSchema = LESSON_SCHEMA;

  const request = model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  });

  const result = await Promise.race([
    request,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('CLIENT_TIMEOUT'), { status: 504 })), timeoutMs)
    ),
  ]);
  const text = extractText(result).trim();
  if (!text) throw Object.assign(new Error('EMPTY_MODEL_OUTPUT'), { status: 502 });
  return text;
}

type UpstreamFailure = ModelAttemptFailure;

function scrubUpstream(message: string): string {
  return message
    .replace(/key=[^&\s"]+/gi, 'key=REDACTED')
    .replace(/AIza[\w-]{10,}/g, 'REDACTED')
    .slice(0, 800);
}

function readUpstream(error: unknown, model?: string): UpstreamFailure {
  const status = readHttpStatus(error);
  const message = scrubUpstream(error instanceof Error ? error.message : String(error ?? ''));
  return { status, message, model };
}

async function generateRaw(
  apiKey: string,
  prompt: string,
  deadline: number,
  maxOutputTokens: number,
  schema?: ResponseSchema,
  temperature?: number,
): Promise<string> {
  return runModelLoop({
    deadline,
    models: modelsToTry(),
    isUnavailable: (model) => unavailableModels.has(model),
    markUnavailable: (model) => { unavailableModels.add(model); },
    call: (model, timeoutMs, thinking) => callModel(
      apiKey,
      model,
      prompt,
      timeoutMs,
      false,
      thinking,
      maxOutputTokens,
      schema,
      temperature,
    ),
    scrub: scrubUpstream,
    log: (entry) => {
      const payload = { ...entry };
      if (payload.stage === 'gen_error') console.error(JSON.stringify(payload));
      else console.log(JSON.stringify(payload));
    },
    onPrimarySuccess: (model) => { preferredModel = model; },
  });
}

function castName(raw: unknown, list: readonly string[]): string {
  const text = String(raw ?? '').trim().toLowerCase();
  return list.find((name) => name.toLowerCase() === text) ?? '';
}

function resolveDialogueSpeakers(raw: Record<string, unknown>): DialogueSpeaker[] {
  const incoming = Array.isArray(raw.speakers) ? raw.speakers : [];
  const first = incoming[0] && typeof incoming[0] === 'object' ? (incoming[0] as Record<string, unknown>).name : '';
  const second = incoming[1] && typeof incoming[1] === 'object' ? (incoming[1] as Record<string, unknown>).name : '';
  const woman = castName(first, FEMALE_NAMES);
  const otherWoman = castName(second, FEMALE_NAMES);
  if (woman && otherWoman && woman !== otherWoman) {
    return [
      { name: woman, gender: 'female' },
      { name: otherWoman, gender: 'female' },
    ];
  }
  return pickDialogueSpeakers();
}

function outputTokenCap(params: LessonParams): number {
  if (params.stage === 'quiz') return Math.min(8192, 600 + params.questionCount * 220);
  if (params.format !== 'dialogue') return Math.min(8192, 500 + params.wordCount * 5);
  const plan = dialogueTurnPlan(params.wordCount);
  return Math.min(8192, 700 + plan.turns * 48);
}

function readParams(bodyText: string | null | undefined): LessonParams | null {
  let body: { prompt?: string } = {};
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    return null;
  }
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(body.prompt || '{}'));
  } catch {
    return null;
  }
  if (raw.mode === 'grammar') return null;
  const customTopic = String(raw.customTopic ?? '').replace(/[\n\r"]/g, ' ').trim().slice(0, 80);
  const listTopic = String(raw.topic ?? '').trim().slice(0, 80);
  const topic = concreteTopic(customTopic || listTopic);
  const level = String(raw.level || 'Beginner');
  const mode = raw.mode === 'listening' ? 'listening' : 'reading';
  const stage = raw.stage === 'quiz' ? 'quiz' : 'story';
  const sourceStory = String(raw.story ?? '').trim().slice(0, 6000);
  if (stage === 'quiz' && sourceStory.length < 20) return null;
  return {
    level,
    topic: topic.label,
    surprise: topic.surprise,
    wordCount: clamp(Number(raw.wordCount) || 100, 40, 400),
    questionCount: clamp(Number(raw.questionCount) || 5, 1, 12),
    vocabularyCount: clamp(Number(raw.vocabularyCount) || 8, 4, 12),
    mode,
    format: normalizeFormat(raw.format),
    speakers: normalizeFormat(raw.format) === 'dialogue' ? resolveDialogueSpeakers(raw) : [],
    stage,
    sourceStory,
    customTopic,
    listTopic,
  };
}

function readPromptObject(bodyText: string | null | undefined): Record<string, unknown> | null {
  let body: { prompt?: string } = {};
  try {
    body = JSON.parse(bodyText || '{}');
  } catch {
    return null;
  }
  try {
    const raw = JSON.parse(String(body.prompt || '{}'));
    return raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readGrammarRequest(bodyText: string | null | undefined): GrammarRequest | null {
  const raw = readPromptObject(bodyText);
  if (!raw || raw.mode !== 'grammar') return null;
  return {
    level: grammarLevel(raw.level),
    exercise: grammarExercise(raw.exercise),
    topic: String(raw.topic ?? '').replace(/[\n\r"]/g, ' ').trim().slice(0, 80),
  };
}

async function freeLimitResponse(
  admin: SupabaseClient,
  userId: string,
  headers: Record<string, string>,
): Promise<HandlerResponse | null> {
  const gate = await admin.rpc('lesson_block_reason', { uid: userId, free_limit: FREE_LESSON_LIMIT });
  const { data: profile } = await admin.from('profiles').select('plan, lessons_used').eq('id', userId).maybeSingle();
  const used = Number(profile?.lessons_used ?? 0);
  const plan = String(profile?.plan ?? 'free');
  if (!gate.error && gate.data === 'pilot_expired') {
    return { statusCode: 402, headers, body: pilotExpiredBody() };
  }
  if (!gate.error && gate.data === 'free_limit') {
    return { statusCode: 402, headers, body: limitBody(used, plan) };
  }
  if (gate.error && plan === 'free' && used >= FREE_LESSON_LIMIT) {
    const access = await admin.rpc('academy_lesson_access', { uid: userId });
    const academySeat = !access.error && access.data === true;
    if (!academySeat) return { statusCode: 402, headers, body: limitBody(used, plan) };
  }
  return null;
}

async function consumeLessonResponse(
  admin: SupabaseClient,
  userId: string,
  headers: Record<string, string>,
): Promise<HandlerResponse | null> {
  const consumed = await admin.rpc('consume_lesson', { uid: userId, free_limit: FREE_LESSON_LIMIT });
  const allowance = readAllowance(consumed.data);
  if (consumed.error || !allowance?.allowed) {
    return {
      statusCode: allowance && !allowance.allowed ? 402 : 502,
      headers,
      body: allowance && !allowance.allowed
        ? (allowance.reason === 'pilot_expired' ? pilotExpiredBody() : limitBody(allowance.lessonsUsed, allowance.plan))
        : JSON.stringify({
          ok: false,
          code: 'LESSON_COUNT',
          message: 'The lesson could not be saved. Please try again.',
        }),
    };
  }
  return null;
}

function grammarModelPayload(parsed: Record<string, unknown> | null): unknown {
  if (!parsed) return null;
  if (Array.isArray(parsed.items)) return parsed;
  if (Array.isArray(parsed.quiz)) return { items: parsed.quiz };
  return parsed;
}

export type ProducedGrammar =
  | { ok: true; set: GrammarSet }
  | { ok: false; problems: string[]; preview: string };

/** Grammar generation only. The caller decides whether this uses a free lesson. */
export async function produceGrammar(
  apiKey: string,
  request: GrammarRequest,
  deadline = Date.now() + 23000,
): Promise<ProducedGrammar> {
  const topUpBudgetMs = 12000;
  let problems: string[] = [];
  let kept: GrammarItem[] = [];
  let set = null as ReturnType<typeof normalizeGrammarSet> | null;
  let lastRaw = '';

  const ask = async (text: string, count: number, prior: GrammarItem[]) => {
    const raw = await generateRaw(apiKey, text, deadline, 6144, grammarSchema(request.exercise, count), 0.3);
    lastRaw = raw;
    return normalizeGrammarSet(grammarModelPayload(parseModelJson(raw)), request, { kept: prior });
  };

  let normalized = await ask(buildGrammarPrompt(request), GRAMMAR_GENERATION_COUNT, []);
  kept = normalized.items;
  if (!normalized.ok) problems = normalized.problems;

  if (kept.length < GRAMMAR_ITEM_COUNT && deadline - Date.now() >= topUpBudgetMs) {
    const needed = GRAMMAR_ITEM_COUNT - kept.length;
    const correction = kept.length === 0
      ? problems.slice(0, 6).join('\n') || 'Return only valid JSON.'
      : undefined;
    try {
      normalized = await ask(buildGrammarTopUpPrompt(request, needed, kept, correction), needed, kept);
      kept = normalized.items;
      if (!normalized.ok) problems = normalized.problems;
    } catch (error) {
      if (kept.length < GRAMMAR_MIN_ITEMS) throw error;
    }
  }

  if (normalized.ok && kept.length >= GRAMMAR_MIN_ITEMS) set = normalized;
  else if (!normalized.ok) problems = normalized.problems;

  if (!set?.ok) {
    return { ok: false, problems, preview: scrubUpstream(lastRaw).slice(0, 400) };
  }
  return { ok: true, set: set.set };
}

export type ProducedPractice =
  | { ok: true; lesson: PreparedLesson }
  | { ok: false; problems: string[]; preview: string };

/** One story or one quiz. The caller decides whether this uses a free lesson. */
export async function producePractice(
  apiKey: string,
  params: LessonParams,
  deadline = Date.now() + 23000,
): Promise<ProducedPractice> {
  let best: { lesson: PreparedLesson; score: number } | null = null;
  let lastRaw = '';
  let prompt = buildPrompt(params);

  const attempts = params.strict ? 3 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0 && deadline - Date.now() < 10000) break;
    let raw = '';
    try {
      raw = await generateRaw(apiKey, prompt, deadline, outputTokenCap(params));
    } catch (error) {
      if (!best) throw error;
      break;
    }
    lastRaw = raw;
    const parsed = parseModelJson(raw);
    if (!parsed) {
      prompt = buildPrompt(params, 'Return only valid JSON. Do not use markdown.');
      continue;
    }
    const lesson = prepareLesson(parsed, params);
    const score = lessonScore(lesson, params);
    console.log(JSON.stringify({
      stage: 'validated',
      requestStage: params.stage,
      attempt,
      wordCount: lesson.wordCount,
      wordCountOk: lesson.wordCountOk,
      problems: lesson.problems.length,
      problem: lesson.problems[0]?.slice(0, 160) ?? '',
    }));
    if (!best || score > best.score) best = { lesson, score };
    const storyDone = params.strict
      ? Boolean(lesson.story) && lesson.wordCountOk && lesson.problems.length === 0
      : Boolean(lesson.story);
    const quizDone = params.strict
      ? lesson.quiz.length === params.questionCount && lesson.problems.length === 0
      : lesson.quiz.length === params.questionCount;
    if (params.stage === 'quiz' ? quizDone : storyDone) break;
    if (deadline - Date.now() < 10000) break;
    prompt = buildPrompt(params, lesson.problems.slice(0, 6).join('\n') || 'Return only valid JSON.');
  }

  const storyReady = Boolean(best?.lesson.story);
  const quizReady = (best?.lesson.quiz.length ?? 0) > 0;
  if (!best || (params.stage === 'quiz' ? !quizReady : !storyReady)) {
    return {
      ok: false,
      problems: best?.lesson.problems ?? [],
      preview: scrubUpstream(lastRaw).slice(0, 400),
    };
  }
  return { ok: true, lesson: best.lesson };
}

function grammarBody(set: GrammarSet): string {
  return JSON.stringify({
    mode: 'grammar',
    level: set.level,
    exercise: set.exercise,
    topic: set.topic,
    title: set.title,
    items: set.items,
  });
}

function missingApiKey(headers: Record<string, string>): HandlerResponse {
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
  };
}

async function createGrammarSet(
  apiKey: string,
  admin: SupabaseClient,
  userId: string,
  request: GrammarRequest,
  headers: Record<string, string>,
): Promise<HandlerResponse> {
  // A typed topic is not in the bank. An empty topic uses an unseen banked set,
  // and falls through to live generation when this person has seen them all.
  if (grammarUsesBank(request.topic)) {
    const claimed = await claimGrammarFromBank(admin, userId, request);
    if (claimed) {
      const blocked = await consumeLessonResponse(admin, userId, headers);
      if (blocked) {
        await releaseGrammarBankItem(admin, userId, claimed.id);
        return blocked;
      }
      console.log(JSON.stringify({ stage: 'grammar_bank', level: claimed.set.level, exercise: claimed.set.exercise }));
      return { statusCode: 200, headers, body: grammarBody(claimed.set) };
    }
    console.log(JSON.stringify({ stage: 'grammar_live', level: request.level, exercise: request.exercise }));
  }
  if (!apiKey) return missingApiKey(headers);
  const produced = await produceGrammar(apiKey, request);
  if (!produced.ok) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        code: 'BAD_MODEL_OUTPUT',
        message: 'The exercises could not be created. Please try again.',
        debug: {
          problems: produced.problems,
          preview: produced.preview,
        },
      }),
    };
  }

  const blocked = await consumeLessonResponse(admin, userId, headers);
  if (blocked) return blocked;
  return { statusCode: 200, headers, body: grammarBody(produced.set) };
}

function practiceFailure(headers: Record<string, string>, stage: 'story' | 'quiz', problems: string[], preview: string): HandlerResponse {
  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({
      ok: false,
      code: 'BAD_MODEL_OUTPUT',
      message: stage === 'quiz'
        ? 'The questions could not be created. Please try again.'
        : 'The lesson could not be created. Please try again.',
      debug: { problems, preview },
    }),
  };
}

/**
 * A list topic (or "Any topic") takes one unseen banked lesson and its stored mp3.
 * A typed custom topic, or an empty bank for that combination, is generated live.
 * Only the custom topic is spoken with Azure on this request. A bank miss keeps
 * the browser speech path by leaving the audio off the response.
 */
async function createListeningLesson(
  apiKey: string,
  admin: SupabaseClient,
  userId: string,
  params: LessonParams,
  headers: Record<string, string>,
): Promise<HandlerResponse> {
  const choice = listeningBankQuery({
    customTopic: params.customTopic ?? '',
    topic: params.listTopic || params.topic,
  });
  const standard = isListeningLevel(params.level)
    && isListeningFormat(params.format)
    && isListeningWordCount(params.wordCount)
    && isListeningQuestionCount(params.questionCount);

  if (choice.bank && standard) {
    const claimed = await claimListeningFromBank(admin, userId, {
      level: params.level,
      format: params.format,
      topic: choice.topic,
      wordCount: params.wordCount,
      questionCount: params.questionCount,
    });
    if (claimed) {
      const blocked = await consumeLessonResponse(admin, userId, headers);
      if (blocked) {
        await releaseGrammarBankItem(admin, userId, claimed.id);
        return blocked;
      }
      const audioUrl = await signListeningAudio(admin, claimed.audioPath);
      console.log(JSON.stringify({
        stage: 'listening_bank',
        level: claimed.lesson.level,
        format: claimed.lesson.format,
        topic: claimed.lesson.topicValue,
      }));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          stage: 'story',
          banked: true,
          bankId: claimed.id,
          story: claimed.lesson.story,
          vocabulary: claimed.lesson.vocabulary,
          resolvedTopic: claimed.lesson.topicLabel,
          wordCount: claimed.lesson.wordCount,
          wordCountOk: true,
          format: claimed.lesson.format,
          dialogue: claimed.lesson.dialogue,
          quiz: claimed.lesson.quiz,
          audioUrl: audioUrl ?? '',
        }),
      };
    }
    console.log(JSON.stringify({
      stage: 'listening_live',
      level: params.level,
      format: params.format,
      reason: 'bank_empty',
    }));
  }

  if (!apiKey) return missingApiKey(headers);
  const produced = await producePractice(apiKey, params, Date.now() + 23000);
  if (!produced.ok) return practiceFailure(headers, 'story', produced.problems, produced.preview);

  let audioBase64 = '';
  if (!choice.bank) {
    const speech = buildListeningSsml({
      format: params.format === 'dialogue' ? 'dialogue' : 'text',
      story: produced.lesson.story,
      dialogue: produced.lesson.dialogue,
    });
    const env = runtimeEnv();
    const audio = await synthesizeNeuralMp3({
      key: readEnvValue(env, 'AZURE_SPEECH_KEY'),
      region: readEnvValue(env, 'AZURE_SPEECH_REGION'),
      ssml: speech.ssml,
      spokenCharacters: speech.spokenCharacters,
    });
    if (audio.ok) {
      audioBase64 = Buffer.from(audio.audio).toString('base64');
      console.log(JSON.stringify({
        stage: 'listening_live_audio',
        spokenCharacters: audio.spokenCharacters,
        attempts: audio.attempts,
      }));
    } else {
      console.log(JSON.stringify({ stage: 'listening_live_audio_miss', status: audio.status, attempts: audio.attempts }));
    }
  }

  const blocked = await consumeLessonResponse(admin, userId, headers);
  if (blocked) return blocked;
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      stage: 'story',
      banked: false,
      story: produced.lesson.story,
      vocabulary: produced.lesson.vocabulary,
      resolvedTopic: params.topic,
      wordCount: produced.lesson.wordCount,
      wordCountOk: produced.lesson.wordCountOk,
      format: params.format,
      dialogue: produced.lesson.dialogue,
      ...(audioBase64 ? { audioBase64 } : {}),
    }),
  };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  try {
    const apiKey = pickApiKey() ?? '';
    if (event.httpMethod === 'OPTIONS') {
      if (!apiKey) {
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
        };
      }
      return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const grammarRequest = readGrammarRequest(event.body);
    const params = grammarRequest ? null : readParams(event.body);
    // A standard grammar or listening request can be served from the bank without Gemini.
    // Reading, a typed grammar topic, a custom listening topic, and an empty listening bank still need the key.
    const listeningStory = params?.mode === 'listening' && params.stage === 'story';
    if (!apiKey && !grammarRequest && !listeningStory) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
      };
    }
    if (!grammarRequest && !params) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Invalid prompt JSON' }),
      };
    }

    const token = bearerToken(event);
    if (!token) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'auth_required' }),
      };
    }
    const admin = adminClient();
    if (!admin) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'NO_AUTH', message: 'Sign-in is not set up yet.' }),
      };
    }
    const userResult = await admin.auth.getUser(token);
    const userId = userResult.data.user?.id;
    if (userResult.error || !userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'auth_required' }),
      };
    }

    if (grammarRequest || params?.stage === 'story') {
      const blocked = await freeLimitResponse(admin, userId, corsHeaders);
      if (blocked) return blocked;
    }

    if (grammarRequest) {
      try {
        return await createGrammarSet(apiKey, admin, userId, grammarRequest, corsHeaders);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const upstream = (error as { upstream?: UpstreamFailure }).upstream ?? readUpstream(error);
        console.error('generate.ts grammar:', JSON.stringify({ message, upstream }));
        const status = upstream.status || Number((error as { status?: number })?.status || 500);
        const httpStatus = status === 429 || status === 503 ? status : status === 504 ? 504 : 502;
        const publicMessage = httpStatus === 429 || httpStatus === 503
          ? 'The story service is busy. Please try again.'
          : httpStatus === 504
            ? 'The story service took too long. Please try again.'
            : 'The exercises could not be created. Please try again.';
        return {
          statusCode: httpStatus,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, code: 'SERVER_ERROR', message: publicMessage }),
        };
      }
    }

    if (!params) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Invalid prompt JSON' }),
      };
    }

    if (params.mode === 'listening' && params.stage === 'story') {
      return await createListeningLesson(apiKey, admin, userId, params, corsHeaders);
    }

    const deadline = Date.now() + 23000;
    const produced = await producePractice(apiKey, params, deadline);
    if (!produced.ok) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          code: 'BAD_MODEL_OUTPUT',
          message: params.stage === 'quiz'
            ? 'The questions could not be created. Please try again.'
            : 'The lesson could not be created. Please try again.',
          debug: {
            problems: produced.problems,
            preview: produced.preview,
          },
        }),
      };
    }
    const best = { lesson: produced.lesson };

    if (params.stage === 'quiz') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          stage: 'quiz',
          quiz: best.lesson.quiz,
        }),
      };
    }

    const blocked = await consumeLessonResponse(admin, userId, corsHeaders);
    if (blocked) return blocked;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        stage: 'story',
        story: best.lesson.story,
        vocabulary: best.lesson.vocabulary,
        resolvedTopic: params.topic,
        wordCount: best.lesson.wordCount,
        wordCountOk: best.lesson.wordCountOk,
        format: params.format,
        dialogue: best.lesson.dialogue,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstream = (error as { upstream?: UpstreamFailure }).upstream ?? readUpstream(error);
    console.error('generate.ts fatal:', JSON.stringify({ message, upstream }));
    const status = upstream.status || Number((error as { status?: number })?.status || 500);
    const publicMessage = message === 'CLIENT_TIMEOUT'
      ? 'The story service took too long. Please try again.'
      : status === 429 || status === 503
        ? 'The story service is busy. Please try again.'
        : 'The lesson could not be created. Please try again.';
    const httpStatus = status === 429 || status === 503 ? status : status === 504 ? 504 : 502;
    return {
      statusCode: httpStatus,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        code: 'SERVER_ERROR',
        message: publicMessage,
        debug: {
          status: upstream.status || status,
          message: upstream.message || scrubUpstream(message),
          model: upstream.model,
          attempts: (error as { attempts?: UpstreamFailure[] }).attempts,
        },
      }),
    };
  }
};
