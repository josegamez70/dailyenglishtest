import { readEnvValue, runtimeEnv } from '../taskMail.ts';

/**
 * Hourly kick for task packs. The work runs in the background function,
 * because a scheduled function stops after 30 seconds and one pack needs
 * several model calls. This file only starts that work.
 * If TASKS_JOB_SECRET is missing, nothing is generated and nothing crashes.
 * Packs are still created when the person opens Tasks.
 */
export default async () => {
  const env = runtimeEnv();
  const secret = readEnvValue(env, 'TASKS_JOB_SECRET');
  const base = (readEnvValue(env, 'URL') || readEnvValue(env, 'DEPLOY_URL')).replace(/\/+$/, '');
  if (!secret || !base) {
    console.log(JSON.stringify({ tasks: 'schedule_skipped', reason: secret ? 'no_url' : 'no_secret' }));
    return new Response(JSON.stringify({ ok: true, skipped: true }));
  }
  try {
    await fetch(`${base}/.netlify/functions/tasks-generate-background`, {
      method: 'POST',
      headers: { 'x-tasks-secret': secret, 'x-tasks-hops': '0' },
    });
  } catch (error) {
    console.error('tasks schedule failed', error instanceof Error ? error.message : 'error');
  }
  return new Response(JSON.stringify({ ok: true }));
};

export const config = {
  schedule: '15 * * * *',
};
