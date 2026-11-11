import { listeningWeeklyBatchSize, weeklyBatchSize, type ExerciseBankKind } from '../exerciseBank.ts';
import { readEnvValue, runtimeEnv, type EnvMap } from '../taskMail.ts';

/**
 * Monday refill for the exercise bank. A scheduled function stops after
 * 30 seconds, and one lesson can take longer than that, so this file
 * only starts the background refill. Grammar and listening each get their own batch.
 * If EXERCISE_BANK_JOB_SECRET is missing, nothing is generated.
 *
 * Manual seed, after the migration is applied:
 * POST /.netlify/functions/exercise-bank-refill-background
 * Header x-exercise-bank-secret: the same secret
 * Optional JSON body {"target": 100, "kind": "listening"}.
 * kind is "grammar" (the default) or "listening".
 * Omit target to use that kind's weekly batch. target is 1 to 3000.
 * The same path is available as /api/exercise-bank-refill-background.
 *
 * EXERCISE_BANK_WEEKLY_BATCH             optional, default 250 grammar sets, max 3000
 * EXERCISE_BANK_LISTENING_WEEKLY_BATCH   optional, default 100 listening lessons, max 3000
 * EXERCISE_BANK_CAP                      optional, default 1000 per combination, max 5000
 * EXERCISE_BANK_GEMINI_GAP_MS            optional, default 5000. Minimum gap between Gemini calls.
 * EXERCISE_BANK_GEMINI_MODEL             optional. Bank only. Empty uses the live model list.
 * AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required for the listening batch.
 */
async function start(env: EnvMap, secret: string, base: string, kind: ExerciseBankKind, target: number): Promise<void> {
  await fetch(`${base}/.netlify/functions/exercise-bank-refill-background`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-exercise-bank-secret': secret,
      'x-exercise-bank-hops': '0',
      'x-exercise-bank-kind': kind,
    },
    body: JSON.stringify({ target, kind }),
    signal: AbortSignal.timeout(8000),
  });
}

export default async () => {
  const env = runtimeEnv();
  const secret = readEnvValue(env, 'EXERCISE_BANK_JOB_SECRET');
  const base = (readEnvValue(env, 'URL') || readEnvValue(env, 'DEPLOY_URL')).replace(/\/+$/, '');
  if (!secret || !base) {
    console.log(JSON.stringify({ exerciseBank: 'schedule_skipped', reason: secret ? 'no_url' : 'no_secret' }));
    return new Response(JSON.stringify({ ok: true, skipped: true }));
  }
  for (const job of [
    { kind: 'grammar' as const, target: weeklyBatchSize(env) },
    { kind: 'listening' as const, target: listeningWeeklyBatchSize(env) },
  ]) {
    try {
      await start(env, secret, base, job.kind, job.target);
    } catch (error) {
      console.error('exercise bank schedule failed', job.kind, error instanceof Error ? error.message : 'error');
    }
  }
  return new Response(JSON.stringify({ ok: true }));
};

export const config = {
  schedule: '30 5 * * 1',
};
