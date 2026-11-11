import { buildListeningSsml, synthesizeNeuralMp3 } from './azureSpeech.ts';
import { pickDialogueSpeakers } from './dialogue.ts';
import { produceGrammar, producePractice, type LessonParams } from './api/generate.ts';
import {
  clearExerciseBankGemini,
  geminiProblemText,
  isRefillPause,
  readBankGeminiModel,
  readGeminiGapMs,
  RefillPause,
  retryWhileBusy,
  setExerciseBankGemini,
  geminiGapWaitMs,
} from './geminiPace.ts';
import {
  EXERCISE_BANK_HOP_LIMIT,
  assembleListeningLesson,
  canBankGrammarSet,
  exerciseBankCap,
  exerciseBankSecretOk,
  grammarSlotKey,
  listeningQuizProblems,
  listeningSlotKey,
  listeningStoryForBank,
  listeningTopicLabel,
  nextGrammarSlot,
  nextListeningSlot,
  readRefillRequest,
  runRefillHop,
  shouldChainRefill,
  type ExerciseBankKind,
  type ListeningSlot,
} from './exerciseBank.ts';
import { exerciseBankFillCounts, exerciseBankReady, insertGrammarBankItem, insertListeningBankItem } from './exerciseBankServer.ts';
import {
  finishExerciseBankRun,
  recordExerciseBankAttempt,
  startExerciseBankRun,
  type BankAttemptResult,
} from './exerciseBankRunLog.ts';
import { readEnvValue, runtimeEnv, type EnvMap } from './taskMail.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
    strict: true,
  };
}

function slotLabel(slot: ListeningSlot): string {
  return `${slot.level}/${slot.format}/${slot.topic}/${slot.wordCount}w/${slot.questionCount}q`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries one Gemini step on the same cell. Rate-limit waits are not a failed cell. */
async function retryBusy<T>(
  deadline: number,
  log: (entry: AttemptLog) => Promise<void>,
  where: { level: string; format: string; topic: string; stage: string },
  run: () => Promise<T>,
): Promise<T> {
  return retryWhileBusy({
    run,
    deadline,
    reserveMs: 20_000,
    sleep,
    onBusy: async (info) => {
      await log({
        ...where,
        stage: where.stage,
        result: 'rate_limited',
        problems: `wait ${Math.round(info.waitMs / 1000)}s. ${info.detail}`,
        durationMs: info.waitMs,
      });
    },
  });
}

type AttemptLog = {
  level: string;
  format: string;
  topic: string;
  stage: string;
  result: BankAttemptResult;
  problems: string;
  durationMs: number;
};

/** Story, then quiz, then one Azure mp3. A speech or model error is a miss, not a thrown batch-ender. */
async function produceListeningLesson(
  apiKey: string,
  env: EnvMap,
  slot: ListeningSlot,
  deadline: number,
  log: (entry: AttemptLog) => Promise<void>,
): Promise<{ lesson: NonNullable<ReturnType<typeof assembleListeningLesson>>; audio: Uint8Array } | null> {
  const started = Date.now();
  const speakers = slot.format === 'dialogue' ? pickDialogueSpeakers() : [];
  const base = { level: slot.level, format: slot.format, topic: slot.topic };
  try {
    const story = await retryBusy(deadline, log, { ...base, stage: 'story' }, () => (
      producePractice(apiKey, listeningParams(slot, 'story', '', speakers), Date.now() + PRODUCE_DEADLINE_MS)
    ));
    if (!story.ok) {
      await log({
        ...base,
        stage: 'story',
        result: 'miss',
        problems: story.problems.slice(0, 4).join(' | ') || 'no story',
        durationMs: Date.now() - started,
      });
      return null;
    }
    const prepared = listeningStoryForBank({
      format: slot.format,
      story: story.lesson.story,
      dialogue: story.lesson.dialogue,
      wordCount: slot.wordCount,
      speakers,
    });
    if (prepared.problems.length > 0) {
      await log({
        ...base,
        stage: 'story',
        result: 'miss',
        problems: prepared.problems.slice(0, 4).join(' | '),
        durationMs: Date.now() - started,
      });
      return null;
    }
    const quizStarted = Date.now();
    const quiz = await retryBusy(deadline, log, { ...base, stage: 'quiz' }, () => (
      producePractice(
        apiKey,
        listeningParams(slot, 'quiz', prepared.story, speakers),
        Date.now() + PRODUCE_DEADLINE_MS,
      )
    ));
    const quizProblems = quiz.ok ? listeningQuizProblems(quiz.lesson.quiz, slot.questionCount) : [];
    if (!quiz.ok || quizProblems.length > 0) {
      await log({
        ...base,
        stage: 'quiz',
        result: 'miss',
        problems: (quiz.ok ? quizProblems : quiz.problems).slice(0, 4).join(' | ') || 'no quiz',
        durationMs: Date.now() - quizStarted,
      });
      return null;
    }
    const lesson = assembleListeningLesson({
      slot,
      story: prepared.story,
      dialogue: prepared.dialogue,
      vocabulary: story.lesson.vocabulary,
      quiz: quiz.lesson.quiz,
      speakers,
    });
    if (!lesson) {
      await log({
        ...base,
        stage: 'assemble',
        result: 'miss',
        problems: 'The lesson did not match the bank rules.',
        durationMs: Date.now() - started,
      });
      return null;
    }
    const speechStarted = Date.now();
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
      await log({
        ...base,
        stage: 'audio',
        result: 'miss',
        problems: `Azure ${audio.status}: ${audio.detail}`,
        durationMs: Date.now() - speechStarted,
      });
      return null;
    }
    await log({
      ...base,
      stage: 'stored',
      result: 'ok',
      problems: quiz.lesson.problems.slice(0, 2).join(' | '),
      durationMs: Date.now() - started,
    });
    return { lesson, audio: audio.audio };
  } catch (error) {
    if (isRefillPause(error)) throw error;
    const busy = /429|503|resource_exhausted|story service is busy/i.test(geminiProblemText(error));
    await log({
      ...base,
      stage: busy ? 'gemini' : 'produce',
      result: busy ? 'rate_limited' : 'error',
      problems: geminiProblemText(error),
      durationMs: Date.now() - started,
    });
    return null;
  }
}

export async function handleRefill(event: HandlerEvent) {
  const env = runtimeEnv();
  if (!exerciseBankSecretOk(header(event, 'x-exercise-bank-secret'), env)) {
    return { statusCode: 401, body: 'unauthorized' };
  }
  const request = readRefillRequest({
    headers: event.headers ?? {},
    body: event.body,
    env,
  });
  const admin = adminClient();
  const runId = await startExerciseBankRun(admin, {
    kind: request.kind ?? 'unknown',
    target: request.target,
    cursor: request.cursor,
    hops: request.hops,
  });
  const finish = (status: 'finished' | 'error', stopReason: string, inserted: number, remaining: number, message: string) => (
    finishExerciseBankRun(admin, runId, { status, stopReason, inserted, remaining, message })
  );
  try {
    if (request.target <= 0 || !request.kind) {
      const reason = request.kind ? 'no_target' : 'bad_kind';
      await finish('finished', reason, 0, 0, reason);
      return { statusCode: 202, body: '' };
    }
    const apiKey = pickApiKey(env);
    if (!admin || !apiKey) {
      const reason = admin ? 'no_api_key' : 'no_database';
      await finish('error', reason, 0, request.target, reason);
      return { statusCode: 202, body: '' };
    }
    if (request.kind === 'listening' && (!readEnvValue(env, 'AZURE_SPEECH_KEY') || !readEnvValue(env, 'AZURE_SPEECH_REGION'))) {
      await finish('error', 'no_azure_speech', 0, request.target, 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is missing');
      return { statusCode: 202, body: '' };
    }
    if (!await exerciseBankReady(admin)) {
      await finish('error', 'migration_not_applied', 0, request.target, 'exercise_bank is not ready');
      return { statusCode: 202, body: '' };
    }
    const cap = exerciseBankCap(env);
    const started = Date.now();
    const deadline = started + HOP_BUDGET_MS;
    const kind = request.kind;
    const counts = await exerciseBankFillCounts(admin, kind);
    const gapMs = readGeminiGapMs(readEnvValue(env, 'EXERCISE_BANK_GEMINI_GAP_MS'));
    const bankModel = readBankGeminiModel(readEnvValue(env, 'EXERCISE_BANK_GEMINI_MODEL'));
    let lastGeminiAt = 0;
    setExerciseBankGemini({
      model: bankModel,
      pace: async () => {
        const wait = geminiGapWaitMs(lastGeminiAt, Date.now(), gapMs);
        if (wait > 0) {
          if (Date.now() + wait + 15_000 > deadline) throw new RefillPause();
          await sleep(wait);
        }
        lastGeminiAt = Date.now();
      },
    });
    const log = (entry: AttemptLog) => recordExerciseBankAttempt(admin, { runId: runId ?? '', kind, ...entry });
    const result = kind === 'listening'
      ? await runRefillHop({
        slots: [],
        target: request.target,
        cursor: request.cursor,
        deadline,
        reserveMs: 80_000,
        pick: (cursor) => nextListeningSlot({ cursor, counts }),
        label: (slot) => slotLabel(slot),
        produce: (slot) => produceListeningLesson(apiKey, env, slot, deadline, log),
        insert: async (slot, produced) => {
          if (
            produced.lesson.level !== slot.level
            || produced.lesson.format !== slot.format
            || produced.lesson.topicValue !== slot.topic
            || produced.lesson.wordCount !== slot.wordCount
            || produced.lesson.questionCount !== slot.questionCount
          ) {
            await log({
              level: slot.level,
              format: slot.format,
              topic: slot.topic,
              stage: 'insert',
              result: 'miss',
              problems: 'Generated lesson did not match the requested cell.',
              durationMs: 0,
            });
            return 'invalid';
          }
          const saved = await insertListeningBankItem(admin, produced.lesson, produced.audio, cap);
          if (saved === 'inserted') counts.set(listeningSlotKey(slot), (counts.get(listeningSlotKey(slot)) ?? 0) + 1);
          if (saved !== 'inserted') {
            await log({
              level: slot.level,
              format: slot.format,
              topic: slot.topic,
              stage: 'insert',
              result: saved === 'error' ? 'error' : 'miss',
              problems: saved,
              durationMs: 0,
            });
          }
          return saved;
        },
      })
      : await runRefillHop({
        slots: [],
        target: request.target,
        cursor: request.cursor,
        deadline,
        pick: (cursor) => nextGrammarSlot({ cursor, counts }),
        label: (slot) => `${slot.level}/${slot.exercise}`,
        produce: async (slot) => {
          const attemptStarted = Date.now();
          try {
            const produced = await retryBusy(
              deadline,
              log,
              { level: slot.level, format: slot.exercise, topic: '', stage: 'grammar' },
              () => produceGrammar(
                apiKey,
                { level: slot.level, exercise: slot.exercise, topic: '' },
                Date.now() + PRODUCE_DEADLINE_MS,
              ),
            );
            if (!produced.ok || !canBankGrammarSet(produced.set)) {
              await log({
                level: slot.level,
                format: slot.exercise,
                topic: '',
                stage: 'grammar',
                result: 'miss',
                problems: produced.ok ? 'The set could not be banked.' : produced.problems.slice(0, 4).join(' | '),
                durationMs: Date.now() - attemptStarted,
              });
              return null;
            }
            await log({
              level: slot.level,
              format: slot.exercise,
              topic: '',
              stage: 'grammar',
              result: 'ok',
              problems: '',
              durationMs: Date.now() - attemptStarted,
            });
            return produced.set;
          } catch (error) {
            if (isRefillPause(error)) throw error;
            await log({
              level: slot.level,
              format: slot.exercise,
              topic: '',
              stage: 'grammar',
              result: geminiProblemText(error).match(/^(429|503)\b/) ? 'rate_limited' : 'error',
              problems: geminiProblemText(error),
              durationMs: Date.now() - attemptStarted,
            });
            return null;
          }
        },
        insert: async (slot, set) => {
          if (set.level !== slot.level || set.exercise !== slot.exercise) return 'invalid';
          const saved = await insertGrammarBankItem(admin, set, cap);
          if (saved === 'inserted') counts.set(grammarSlotKey(slot), (counts.get(grammarSlotKey(slot)) ?? 0) + 1);
          if (saved !== 'inserted') {
            await log({
              level: slot.level,
              format: slot.exercise,
              topic: '',
              stage: 'insert',
              result: saved === 'error' ? 'error' : 'miss',
              problems: saved,
              durationMs: 0,
            });
          }
          return saved;
        },
      });
    await finish('finished', result.stopped ?? 'target', result.inserted, result.remaining, bankModel ? `model ${bankModel}` : '');
    if (shouldChainRefill(result, request.hops, EXERCISE_BANK_HOP_LIMIT)) {
      await chain(env, result.remaining, result.cursor, request.hops + 1, kind);
    }
    return { statusCode: 202, body: '' };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'refill failed';
    await finish('error', 'exception', 0, request.target, message);
    return { statusCode: 202, body: '' };
  } finally {
    clearExerciseBankGemini();
  }
}
