import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AzureSpeechError, buildListeningSsml, synthesizeNeuralMp3 } from '../azureSpeech.ts';
import { pickDialogueSpeakers } from '../dialogue.ts';
import { produceGrammar, producePractice, type LessonParams } from './generate.ts';
import {
  EXERCISE_BANK_HOP_LIMIT,
  assembleListeningLesson,
  exerciseBankCap,
  exerciseBankSecretOk,
  listeningTopicLabel,
  nextGrammarSlot,
  nextListeningSlot,
  grammarSlotKey,
  listeningSlotKey,
  readRefillRequest,
  runRefillHop,
  shouldChainRefill,
  canBankGrammarSet,
  type ExerciseBankKind,
  type ListeningSlot,
} from '../exerciseBank.ts';
import { exerciseBankFillCounts, exerciseBankReady, insertGrammarBankItem, insertListeningBankItem } from '../exerciseBankServer.ts';
import { readEnvValue, runtimeEnv, type EnvMap } from '../taskMail.ts';

type HandlerEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined> | null;
};

const HOP_BUDGET_MS = 10 * 60 * 1000;
const PRODUCE_DEADLINE_MS = 32_000;

function header(event: HandlerEvent, name: string): string {
  const headers = event.headers ?? {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function adminClient(): SupabaseClient | null {
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function pickApiKey(env: EnvMap): string {
  return (
    readEnvValue(env, 'API_KEY')
    || readEnvValue(env, 'GOOGLE_API_KEY')
    || readEnvValue(env, 'VITE_API_KEY')
    || readEnvValue(env, 'GENAI_API_KEY')
  );
}

async function chain(
  env: EnvMap,
  remaining: number,
  cursor: number,
  hops: number,
  kind: ExerciseBankKind,
): Promise<void> {
  const secret = readEnvValue(env, 'EXERCISE_BANK_JOB_SECRET');
  const base = (readEnvValue(env, 'URL') || readEnvValue(env, 'DEPLOY_URL')).replace(/\/+$/, '');
  if (!secret || !base || remaining <= 0) return;
  await fetch(`${base}/.netlify/functions/exercise-bank-refill-background`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-exercise-bank-secret': secret,
      'x-exercise-bank-remaining': String(remaining),
      'x-exercise-bank-cursor': String(cursor),
      'x-exercise-bank-hops': String(hops),
      'x-exercise-bank-kind': kind,
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
}

function listeningParams(slot: ListeningSlot, stage: 'story' | 'quiz', story: string, speakers: LessonParams['speakers']): LessonParams {
  return {
    level: slot.level,
    topic: listeningTopicLabel(slot.topic),
    surprise: false,
    wordCount: slot.wordCount,
    questionCount: slot.questionCount,
    vocabularyCount: 8,
    mode: 'listening',
    format: slot.format,
    speakers,
    stage,
    sourceStory: story,
  };
}

/** Story, then quiz, then one Azure mp3. Lessons are synthesized one at a time. */
async function produceListeningLesson(
  apiKey: string,
  env: EnvMap,
  slot: ListeningSlot,
): Promise<{ lesson: NonNullable<ReturnType<typeof assembleListeningLesson>>; audio: Uint8Array } | null> {
  const speakers = slot.format === 'dialogue' ? pickDialogueSpeakers() : [];
  const story = await producePractice(apiKey, listeningParams(slot, 'story', '', speakers), Date.now() + PRODUCE_DEADLINE_MS);
  if (!story.ok || !story.lesson.wordCountOk || story.lesson.problems.length > 0 || !story.lesson.story) return null;
  const quiz = await producePractice(
    apiKey,
    listeningParams(slot, 'quiz', story.lesson.story, speakers),
    Date.now() + PRODUCE_DEADLINE_MS,
  );
  if (!quiz.ok || quiz.lesson.problems.length > 0 || quiz.lesson.quiz.length !== slot.questionCount) return null;
  const lesson = assembleListeningLesson({
    slot,
    story: story.lesson.story,
    dialogue: story.lesson.dialogue,
    vocabulary: story.lesson.vocabulary,
    quiz: quiz.lesson.quiz,
    speakers,
  });
  if (!lesson) return null;
  const speech = buildListeningSsml({
    format: lesson.format,
    story: lesson.story,
    dialogue: lesson.dialogue,
  });
  const audio = await synthesizeNeuralMp3({
    key: readEnvValue(env, 'AZURE_SPEECH_KEY'),
    region: readEnvValue(env, 'AZURE_SPEECH_REGION'),
    ssml: speech.ssml,
    spokenCharacters: speech.spokenCharacters,
  });
  if (!audio.ok) {
    console.log(JSON.stringify({
      exerciseBank: 'audio_miss',
      status: audio.status,
      attempts: audio.attempts,
      level: slot.level,
      format: slot.format,
    }));
    if (audio.retryable) throw new AzureSpeechError(audio.status, audio.attempts);
    return null;
  }
  console.log(JSON.stringify({
    exerciseBank: 'audio_ready',
    spokenCharacters: audio.spokenCharacters,
    attempts: audio.attempts,
    bytes: audio.audio.byteLength,
  }));
  return { lesson, audio: audio.audio };
}

/** Validates with the existing grammar generator, skips duplicate hashes, and trims each slot to the cap. */
export const handler = async (event: HandlerEvent) => {
  const env = runtimeEnv();
  if (!exerciseBankSecretOk(header(event, 'x-exercise-bank-secret'), env)) {
    return { statusCode: 401, body: 'unauthorized' };
  }
  const request = readRefillRequest({
    headers: event.headers ?? {},
    body: event.body,
    env,
  });
  if (request.target <= 0 || !request.kind) {
    console.log(JSON.stringify({ exerciseBank: 'stopped', reason: request.kind ? 'no_target' : 'bad_kind', hops: request.hops }));
    return { statusCode: 202, body: '' };
  }
  const admin = adminClient();
  const apiKey = pickApiKey(env);
  if (!admin || !apiKey) {
    console.log(JSON.stringify({ exerciseBank: 'skipped', reason: admin ? 'no_api_key' : 'no_database' }));
    return { statusCode: 202, body: '' };
  }
  if (request.kind === 'listening' && (!readEnvValue(env, 'AZURE_SPEECH_KEY') || !readEnvValue(env, 'AZURE_SPEECH_REGION'))) {
    console.log(JSON.stringify({ exerciseBank: 'skipped', reason: 'no_azure_speech' }));
    return { statusCode: 202, body: '' };
  }
  if (!await exerciseBankReady(admin)) {
    console.log(JSON.stringify({ exerciseBank: 'skipped', reason: 'migration_not_applied' }));
    return { statusCode: 202, body: '' };
  }
  const cap = exerciseBankCap(env);
  const started = Date.now();
  const kind = request.kind;
  const counts = await exerciseBankFillCounts(admin, kind);
  try {
    const result = kind === 'listening'
      ? await runRefillHop({
        slots: [],
        target: request.target,
        cursor: request.cursor,
        deadline: started + HOP_BUDGET_MS,
        reserveMs: 80_000,
        pick: (cursor) => nextListeningSlot({ cursor, counts }),
        produce: (slot) => produceListeningLesson(apiKey, env, slot),
        insert: async (slot, produced) => {
          if (
            produced.lesson.level !== slot.level
            || produced.lesson.format !== slot.format
            || produced.lesson.topicValue !== slot.topic
            || produced.lesson.wordCount !== slot.wordCount
            || produced.lesson.questionCount !== slot.questionCount
          ) return 'invalid';
          const saved = await insertListeningBankItem(admin, produced.lesson, produced.audio, cap);
          if (saved === 'inserted') counts.set(listeningSlotKey(slot), (counts.get(listeningSlotKey(slot)) ?? 0) + 1);
          return saved;
        },
      })
      : await runRefillHop({
        slots: [],
        target: request.target,
        cursor: request.cursor,
        deadline: started + HOP_BUDGET_MS,
        pick: (cursor) => nextGrammarSlot({ cursor, counts }),
        produce: async (slot) => {
          const produced = await produceGrammar(
            apiKey,
            { level: slot.level, exercise: slot.exercise, topic: '' },
            Date.now() + PRODUCE_DEADLINE_MS,
          );
          if (!produced.ok) {
            console.log(JSON.stringify({
              exerciseBank: 'miss',
              level: slot.level,
              exercise: slot.exercise,
              problems: produced.problems.slice(0, 4),
            }));
            return null;
          }
          if (!canBankGrammarSet(produced.set)) return null;
          return produced.set;
        },
        insert: async (slot, set) => {
          if (set.level !== slot.level || set.exercise !== slot.exercise) return 'invalid';
          const saved = await insertGrammarBankItem(admin, set, cap);
          if (saved === 'inserted') counts.set(grammarSlotKey(slot), (counts.get(grammarSlotKey(slot)) ?? 0) + 1);
          return saved;
        },
      });
    console.log(JSON.stringify({ exerciseBank: 'hop', kind, hops: request.hops, cap, ...result }));
    if (shouldChainRefill(result, request.hops, EXERCISE_BANK_HOP_LIMIT)) {
      await chain(env, result.remaining, result.cursor, request.hops + 1, kind);
    }
  } catch (error) {
    console.error('exercise bank refill failed', error instanceof Error ? error.message.slice(0, 200) : 'error');
  }
  return { statusCode: 202, body: '' };
};
