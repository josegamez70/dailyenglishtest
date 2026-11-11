import { weeklyBatchSize } from '../exerciseBank.ts';
import { readEnvValue, runtimeEnv } from '../taskMail.ts';

/**
 * Monday refill for the exercise bank. A scheduled function stops after
 * 30 seconds, and one grammar set can take longer than that, so this file
 * only starts the background refill.
 * If EXERCISE_BANK_JOB_SECRET is missing, nothing is generated.
 *
 * Manual seed, after the migration is applied:
 * POST /.netlify/functions/exercise-bank-refill-background
 * Header x-exercise-bank-secret: the same secret
 * Optional JSON body {"target": 250} (1 to 3000). Omit it to use the weekly batch.
 * The same path is available as /api/exercise-bank-refill-background.
 *
 * EXERCISE_BANK_WEEKLY_BATCH  optional, default 250, max 3000
 * EXERCISE_BANK_CAP           optional, default 1000 per level and exercise, max 5000
 */
export default async () => {
  const env = runtimeEnv();
  const secret = readEnvValue(env, 'EXERCISE_BANK_JOB_SECRET');
  const base = (readEnvValue(env, 'URL') || readEnvValue(env, 'DEPLOY_URL')).replace(/\/+$/, '');
  if (!secret || !base) {
    console.log(JSON.stringify({ exerciseBank: 'schedule_skipped', reason: secret ? 'no_url' : 'no_secret' }));
    return new Response(JSON.stringify({ ok: true, skipped: true }));
  }
  try {
    await fetch(`${base}/.netlify/functions/exercise-bank-refill-background`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-exercise-bank-secret': secret,
        'x-exercise-bank-hops': '0',
      },
      body: JSON.stringify({ target: weeklyBatchSize(env) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('exercise bank schedule failed', error instanceof Error ? error.message : 'error');
  }
  return new Response(JSON.stringify({ ok: true }));
};

export const config = {
  schedule: '30 5 * * 1',
};
