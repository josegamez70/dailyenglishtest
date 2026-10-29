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
  DIALOGUE_SPEAKERS,
  dialogueSpeakers,
  normalizeFormat,
  speakersWithGender,
  parseDialogue,
  renderDialogue,
  spokenWordCount,
  type ContentFormat,
  type DialogueTurn,
  type SpeakerGender,
} from '../dialogue';
import { normalizeQuiz, type NormalizedQuizQuestion } from '../quizNormalize';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
};

type HandlerResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

type LessonParams = {
  level: string;
  topic: string;
  wordCount: number;
  questionCount: number;
  vocabularyCount: number;
  mode: 'reading' | 'listening';
  format: ContentFormat;
  speakers: { name: string; gender: SpeakerGender }[];
  surprise: boolean;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 2.0 and 1.5 were shut down (HTTP 404). 2.5 is limited to older keys and also 404s for this project.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

const LESSON_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    story: {
      type: SchemaType.STRING,
      description: 'The text or the dialogue written as lines. No title and no word count.',
    },
    dialogue: {
      type: SchemaType.ARRAY,
      description: 'Dialogue turns. Empty for a Text lesson. Two speakers for a Dialogue lesson.',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          speaker: { type: SchemaType.STRING, description: 'A short first name.' },
          gender: { type: SchemaType.STRING, description: 'female or male. The same speaker always has the same gender.' },
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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
  if (key.includes('beginner')) {
    return [
      'Level: Beginner.',
      'Use short sentences and common words.',
      'Ask simple questions about facts the story states: who, what, where, and when.',
      'Each question has exactly one correct answer.',
      'Wrong answers must be clearly different.',
    ].join(' ');
  }
  return [
    'Level: Basic.',
    'Use very short sentences and very common words.',
    'Ask very simple questions about facts the story states.',
    'Each question has exactly one correct answer.',
    'Wrong answers must be clearly different.',
  ].join(' ');
}

function formatRules(format: ContentFormat, speakers: { name: string; gender: SpeakerGender }[]): string {
  if (format === 'dialogue') {
    const cast = speakers.map((speaker) => `${speaker.name} (${speaker.gender})`).join(' and ');
    return [
      'FORMAT: Dialogue.',
      `Write a conversation between exactly these two speakers: ${cast}.`,
      'Do not use personal names. speaker must be exactly "Person 1" or "Person 2".',
      'Return a dialogue array. Each item has speaker, gender, and line.',
      'gender for Person 1 is female. gender for Person 2 is male.',
      'Do not put the label inside line.',
      'Let them take turns. Write at least 6 turns.',
      'Also set story to the same dialogue, one turn per line, like "Person 1: Hello."',
      'Count only the words inside line. Do not count the speaker names.',
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

function buildPrompt(params: LessonParams, corrective?: string): string {
  const { min, max } = wordCountBounds(params.wordCount);
  const topic = params.topic.replace(/["\n\r]/g, ' ').trim();
  const correction = corrective
    ? `\n\nThe previous attempt was rejected. Fix every problem below, then return a new JSON object:\n${corrective}\n`
    : '';

  return `
You write English learning materials for students around the world. Use clear, natural English.

Create one ${params.mode} lesson.
Topic: ${topic}
Do not write a story about the words "wildcard" or "any topic". The story topic is exactly: ${topic}.

${levelRules(params.level)}
${modeRules(params.mode)}
${formatRules(params.format, params.speakers)}

LENGTH (required):
- The ${params.format === 'dialogue' ? 'spoken lines' : 'text'} must contain between ${min} and ${max} words.
- Target: ${params.wordCount} words.
- Count every word before you answer. A contraction such as "don't" is one word.
- ${params.format === 'dialogue' ? 'Do not count speaker names.' : 'Count every word in the text.'}
- If it is too long, delete whole sentences until it fits. If it is too short, add a sentence.

QUIZ (required):
- Exactly ${params.questionCount} questions.
- Each question has exactly 4 options and exactly one correct answer.
- Option text must NOT start with a letter label. Never write "A.", "A)", "(A)", "A:", "A-", or a lone "A ", "B ", "C ", or "D " in front of an answer.
- Write each option as plain answer text in sentence case.
- correctAnswer must be the full text of the one correct option, copied exactly from options. Do not answer with only A, B, C, or D.
- The story must support that one answer. The other three options are plausible but wrong, and none of them is also defensible.
- Wrong answers must not overlap in meaning, must not be near-copies of the correct answer, and must not be near-synonyms of the correct idea.
- The question text must NOT contain the correct answer or its key words. Read the question and the correct option together. If the question already says the answer, rewrite the question.
- Do not use "all of the above" or "none of the above".
- skill: "detail", "inference", "vocabulary", or "intent".
- explanation: one or two short sentences in simple English saying why the correct option is right and why the other options are not.
- supportingSentence: copy ONE full sentence from the story, exactly as written, that shows why the answer is correct. It must appear in the story.

VOCABULARY:
- Exactly ${params.vocabularyCount} useful words or short phrases that appear in the story.
- definition: a short explanation in simple English.

Return ONLY JSON. No markdown and no extra text.
${correction}
`.trim();
}

function parseModelJson(rawText: string): Record<string, unknown> | null {
  const clean = rawText.replace(/^```json\s*|\s*```$/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function prepareLesson(parsed: Record<string, unknown>, params: LessonParams): PreparedLesson {
  let story = typeof parsed.story === 'string' ? parsed.story.trim() : '';
  let dialogue: DialogueTurn[] = [];
  if (params.format === 'dialogue') {
    const fromField = parseDialogue(parsed.dialogue);
    const fromStory = parseDialogue(story);
    const base = fromField.length >= fromStory.length ? fromField : fromStory;
    const genders = new Map<string, DialogueTurn['gender']>();
    for (const turn of [...fromStory, ...fromField]) {
      if (turn.gender) genders.set(turn.speaker.toLowerCase(), turn.gender);
    }
    dialogue = base.map((turn) => ({
      ...turn,
      gender: genders.get(turn.speaker.toLowerCase()) ?? turn.gender,
    }));
    if (dialogue.length) story = renderDialogue(dialogue);
  }
  const quiz = normalizeQuiz(Array.isArray(parsed.quiz) ? parsed.quiz : []);
  const problems: string[] = [];
  const wordCount = params.format === 'dialogue' ? spokenWordCount(dialogue) : countWords(story);
  const { min, max } = wordCountBounds(params.wordCount);
  const wordCountOk = wordCount >= min && wordCount <= max;

  if (!story) problems.push('The story is missing.');
  if (params.format === 'dialogue') {
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
  }
  if (!wordCountOk) {
    problems.push(
      params.format === 'dialogue'
        ? `The spoken lines are ${wordCount} words. Rewrite them so they are between ${min} and ${max} words (target ${params.wordCount}). Do not count the names.`
        : `The story is ${wordCount} words. Rewrite it so it is between ${min} and ${max} words (target ${params.wordCount}).`
    );
  }
  if (quiz.length !== params.questionCount) {
    problems.push(`Write exactly ${params.questionCount} questions. You wrote ${quiz.length}.`);
  }

  const rawQuiz = Array.isArray(parsed.quiz) ? parsed.quiz : [];
  const skills: Array<QuestionSkill | null> = [];

  quiz.forEach((question, index) => {
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

  if (vocabulary.length < Math.min(4, params.vocabularyCount)) {
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
  useThinkingOff = true
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  const generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType: string;
    responseSchema?: ResponseSchema;
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string };
  } = {
    temperature: 0.7,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  };
  if (useThinkingOff) {
    generationConfig.thinkingConfig = modelName.includes('2.5')
      ? { thinkingBudget: 0 }
      : modelName.includes('3.8')
        ? { thinkingLevel: 'low' }
        : { thinkingLevel: 'minimal' };
  }
  if (useSchema) generationConfig.responseSchema = LESSON_SCHEMA;

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
  return extractText(result).trim();
}

type UpstreamFailure = { status: number; message: string; model?: string };

function scrubUpstream(message: string): string {
  return message
    .replace(/key=[^&\s"]+/gi, 'key=REDACTED')
    .replace(/AIza[\w-]{10,}/g, 'REDACTED')
    .slice(0, 800);
}

function readUpstream(error: unknown, model?: string): UpstreamFailure {
  const status = Number((error as { status?: number })?.status || (error as { code?: number })?.code || 0);
  const message = scrubUpstream(error instanceof Error ? error.message : String(error ?? ''));
  return { status, message, model };
}

async function generateRaw(apiKey: string, prompt: string, deadline: number): Promise<string> {
  let lastError: unknown;
  let lastModel = '';
  const attempts: UpstreamFailure[] = [];
  for (const modelName of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 7000) break;
    const timeout = Math.min(23000, remaining - 1200);
    try {
      console.log(JSON.stringify({ stage: 'gen_start', modelName }));
      const text = await callModel(apiKey, modelName, prompt, timeout, false);
      if (text) return text;
    } catch (error) {
      lastError = error;
      lastModel = modelName;
      const message = error instanceof Error ? error.message : String(error);
      const status = Number((error as { status?: number; code?: number })?.status || (error as { code?: number })?.code);
      console.error(JSON.stringify({ stage: 'gen_error', modelName, status, message }));
      attempts.push(readUpstream(error, modelName));
      const dailyQuota = /per day|retry in \d+h/i.test(message);
      if ((status === 429 || status === 503) && !dailyQuota && deadline - Date.now() > 12000) {
        await sleep(400);
        const retryBudget = Math.min(8000, deadline - Date.now() - 8000);
        if (retryBudget >= 5000) {
          try {
            const text = await callModel(apiKey, modelName, prompt, retryBudget, false);
            if (text) return text;
          } catch (retryError) {
            lastError = retryError;
            lastModel = modelName;
          }
        }
      }
      if (status === 400 && /invalid argument/i.test(message) && deadline - Date.now() > 6000) {
        try {
          const text = await callModel(
            apiKey,
            modelName,
            prompt,
            Math.min(22000, Math.max(5000, deadline - Date.now() - 1500)),
            false,
            false
          );
          if (text) return text;
        } catch (thinkingError) {
          lastError = thinkingError;
          lastModel = modelName;
          attempts.push(readUpstream(thinkingError, modelName));
        }
      }
      if (/schema|responseMimeType|INVALID_ARGUMENT/i.test(message) && !/invalid argument/i.test(message)) {
        try {
          const retryTimeout = Math.min(timeout, deadline - Date.now() - 400);
          if (retryTimeout > 4000) {
            const text = await callModel(apiKey, modelName, prompt, retryTimeout, false);
            if (text) return text;
          }
        } catch (schemaError) {
          lastError = schemaError;
        }
      }
      if (![404, 400, 429, 500, 502, 503, 504].includes(status) && status) break;
    }
  }
  const upstream = readUpstream(lastError, lastModel);
  const busy = upstream.status === 429 || upstream.status === 503;
  throw Object.assign(
    new Error(busy ? 'The story service is busy. Please try again.' : 'The lesson could not be created. Please try again.'),
    { status: busy ? upstream.status : 502, upstream, attempts }
  );
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
  const topic = concreteTopic(raw.topic);
  const level = String(raw.level || 'Beginner');
  const mode = raw.mode === 'listening' ? 'listening' : 'reading';
  return {
    level,
    topic: topic.label,
    surprise: topic.surprise,
    wordCount: clamp(Number(raw.wordCount) || 100, 40, 400),
    questionCount: clamp(Number(raw.questionCount) || 5, 1, 12),
    vocabularyCount: clamp(Number(raw.vocabularyCount) || 8, 4, 12),
    mode,
    format: normalizeFormat(raw.format),
    speakers: normalizeFormat(raw.format) === 'dialogue' ? DIALOGUE_SPEAKERS : [],
  };
}

export const handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const apiKey = pickApiKey();
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'NO_API_KEY', message: 'Missing API key' }),
      };
    }

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    const params = readParams(event.body);
    if (!params) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Invalid prompt JSON' }),
      };
    }

    const deadline = Date.now() + 25000;
    let best: { lesson: PreparedLesson; score: number } | null = null;
    let prompt = buildPrompt(params);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (deadline - Date.now() < 5000) break;
      let raw = '';
      try {
        raw = await generateRaw(apiKey, prompt, deadline);
      } catch (error) {
        if (!best) throw error;
        break;
      }
      const parsed = parseModelJson(raw);
      if (!parsed) {
        prompt = buildPrompt(params, 'Return only valid JSON. Do not use markdown.');
        continue;
      }
      const lesson = prepareLesson(parsed, params);
      const score = lessonScore(lesson, params);
      console.log(JSON.stringify({
        stage: 'validated',
        attempt,
        wordCount: lesson.wordCount,
        wordCountOk: lesson.wordCountOk,
        problems: lesson.problems.length,
      }));
      if (!best || score > best.score) best = { lesson, score };
      if (lesson.problems.length === 0) break;
      prompt = buildPrompt(params, lesson.problems.slice(0, 8).join('\n'));
      // Give the network a beat before a second model call.
      if (attempt === 0 && deadline - Date.now() > 8000) await sleep(200);
    }

    if (!best || !best.lesson.story || best.lesson.quiz.length === 0) {
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          code: 'BAD_MODEL_OUTPUT',
          message: 'The lesson could not be created. Please try again.',
        }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        story: best.lesson.story,
        quiz: best.lesson.quiz,
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
