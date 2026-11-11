import { readEnvValue, runtimeEnv } from '../taskMail.ts';
import { generateDuePacks, jobSecretOk } from '../taskServer.ts';

type HandlerEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined> | null;
};

function header(event: HandlerEvent, name: string): string {
  const headers = event.headers ?? {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

/** Builds due packs and sends reminder email when mail is configured. */
export const handler = async (event: HandlerEvent) => {
  if (!jobSecretOk(header(event, 'x-tasks-secret'))) {
    return { statusCode: 401, body: 'unauthorized' };
  }
  const hops = Number(header(event, 'x-tasks-hops') || '0');
  try {
    const result = await generateDuePacks(2);
    console.log(JSON.stringify({ tasks: 'background', ...result, hops }));
    if (result.remaining && hops < 8) {
      const env = runtimeEnv();
      const base = (readEnvValue(env, 'URL') || readEnvValue(env, 'DEPLOY_URL')).replace(/\/+$/, '');
      const secret = readEnvValue(env, 'TASKS_JOB_SECRET');
      if (base && secret) {
        await fetch(`${base}/.netlify/functions/tasks-generate-background`, {
          method: 'POST',
          headers: { 'x-tasks-secret': secret, 'x-tasks-hops': String(hops + 1) },
        }).catch(() => undefined);
      }
    }
  } catch (error) {
    console.error('tasks background failed', error instanceof Error ? error.message : 'error');
  }
  return { statusCode: 202, body: '' };
};
