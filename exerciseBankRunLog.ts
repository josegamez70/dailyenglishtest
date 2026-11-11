import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnvValue, runtimeEnv } from './taskMail.ts';

export type BankAttemptResult = 'ok' | 'miss' | 'error';

export type BankAttemptInput = {
  runId: string;
  kind: string;
  level?: string;
  format?: string;
  topic?: string;
  stage: string;
  result: BankAttemptResult;
  problems?: string;
  durationMs?: number;
};

export function clipDiagnostic(value: string, max = 500): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function diagnosticClient(): SupabaseClient | null {
  const env = runtimeEnv();
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ignored(error: { code?: string; message?: string } | null): boolean {
  if (!error) return true;
  const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return message.includes('42p01')
    || message.includes('pgrst')
    || message.includes('does not exist')
    || message.includes('schema cache');
}

/** Opens a run. A missing table returns null and the refill still continues. */
export async function startExerciseBankRun(
  admin: SupabaseClient | null,
  input: { kind: string; target: number; cursor: number; hops: number },
): Promise<string | null> {
  if (!admin) return null;
  const inserted = await admin.from('exercise_bank_runs').insert({
    kind: input.kind,
    target: input.target,
    cursor: input.cursor,
    hops: input.hops,
    status: 'started',
  }).select('id').maybeSingle();
  if (inserted.error) {
    if (!ignored(inserted.error)) {
      console.error(JSON.stringify({ exerciseBank: 'run_log_failed', code: inserted.error.code ?? '' }));
    }
    return null;
  }
  return typeof inserted.data?.id === 'string' ? inserted.data.id : null;
}

export async function finishExerciseBankRun(
  admin: SupabaseClient | null,
  runId: string | null,
  input: { status: 'finished' | 'error'; stopReason: string; inserted: number; remaining: number; message: string },
): Promise<void> {
  if (!admin || !runId) return;
  const updated = await admin.from('exercise_bank_runs').update({
    finished_at: new Date().toISOString(),
    status: input.status,
    stop_reason: clipDiagnostic(input.stopReason, 80),
    inserted: input.inserted,
    remaining: input.remaining,
    message: clipDiagnostic(input.message, 500),
  }).eq('id', runId);
  if (updated.error && !ignored(updated.error)) {
    console.error(JSON.stringify({ exerciseBank: 'run_log_failed', code: updated.error.code ?? '' }));
  }
}

export async function recordExerciseBankAttempt(
  admin: SupabaseClient | null,
  input: BankAttemptInput,
): Promise<void> {
  if (!admin || !input.runId) return;
  const inserted = await admin.from('exercise_bank_attempts').insert({
    run_id: input.runId,
    kind: input.kind,
    level: input.level ?? '',
    format: input.format ?? '',
    topic: clipDiagnostic(input.topic ?? '', 80),
    stage: clipDiagnostic(input.stage, 40),
    result: input.result,
    problems: clipDiagnostic(input.problems ?? ''),
    duration_ms: Math.max(0, Math.round(input.durationMs ?? 0)),
  });
  if (inserted.error && !ignored(inserted.error)) {
    console.error(JSON.stringify({ exerciseBank: 'run_log_failed', code: inserted.error.code ?? '' }));
  }
}

/** Used when the refill module itself fails to load or throws before a run row exists. */
export async function recordExerciseBankCrash(error: unknown): Promise<void> {
  const admin = diagnosticClient();
  if (!admin) return;
  const message = clipDiagnostic(error instanceof Error ? `${error.name}: ${error.message}` : 'refill crashed');
  const inserted = await admin.from('exercise_bank_runs').insert({
    kind: 'unknown',
    target: 0,
    status: 'error',
    stop_reason: 'startup',
    message,
    finished_at: new Date().toISOString(),
  });
  if (inserted.error && !ignored(inserted.error)) {
    console.error(JSON.stringify({ exerciseBank: 'run_log_failed', code: inserted.error.code ?? '' }));
  }
}
