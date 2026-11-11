import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { produceGrammar } from './generate.ts';
import {
  EXERCISE_BANK_HOP_LIMIT,
  exerciseBankCap,
  exerciseBankSecretOk,
  grammarSlots,
  readRefillRequest,
  runRefillHop,
  shouldChainRefill,
  canBankGrammarSet,
} from '../exerciseBank.ts';
import { exerciseBankReady, insertGrammarBankItem } from '../exerciseBankServer.ts';
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

async function chain(env: EnvMap, remaining: number, cursor: number, hops: number): Promise<void> {
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
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined);
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
  if (request.target <= 0) {
    console.log(JSON.stringify({ exerciseBank: 'stopped', reason: 'no_target', hops: request.hops }));
    return { statusCode: 202, body: '' };
  }
  const admin = adminClient();
  const apiKey = pickApiKey(env);
  if (!admin || !apiKey) {
    console.log(JSON.stringify({ exerciseBank: 'skipped', reason: admin ? 'no_api_key' : 'no_database' }));
    return { statusCode: 202, body: '' };
  }
  if (!await exerciseBankReady(admin)) {
    console.log(JSON.stringify({ exerciseBank: 'skipped', reason: 'migration_not_applied' }));
    return { statusCode: 202, body: '' };
  }
  const cap = exerciseBankCap(env);
  const started = Date.now();
  try {
    const result = await runRefillHop({
      slots: grammarSlots(),
      target: request.target,
      cursor: request.cursor,
      deadline: started + HOP_BUDGET_MS,
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
        return insertGrammarBankItem(admin, set, cap);
      },
    });
    console.log(JSON.stringify({ exerciseBank: 'hop', hops: request.hops, cap, ...result }));
    if (shouldChainRefill(result, request.hops, EXERCISE_BANK_HOP_LIMIT)) {
      await chain(env, result.remaining, result.cursor, request.hops + 1);
    }
  } catch (error) {
    console.error('exercise bank refill failed', error instanceof Error ? error.message.slice(0, 200) : 'error');
  }
  return { statusCode: 202, body: '' };
};
