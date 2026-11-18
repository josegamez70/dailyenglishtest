import { readEnvValue, runtimeEnv } from '../taskMail.ts';
import { deliverScoreboardEmails, scoreboardEmailsEnabled } from '../scoreboardEmailJob.ts';

/**
 * Morning in Spain: 06:00 UTC is 07:00 in winter and 08:00 in summer.
 * SCOREBOARD_EMAILS_ENABLED must be the exact word true. Otherwise nothing is sent.
 * TASK_SMTP_* and APP_BASE_URL are the existing mailbox settings.
 */
export default async () => {
  const env = runtimeEnv();
  if (!scoreboardEmailsEnabled(env)) {
    console.log(JSON.stringify({ scoreboardEmail: 'skipped', reason: 'disabled' }));
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'disabled' }));
  }
  if (!readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY')) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'not_configured' }));
  }
  const result = await deliverScoreboardEmails(env);
  console.log(JSON.stringify({ scoreboardEmail: 'ran', sent: result.sent, yesterday: result.yesterday }));
  return new Response(JSON.stringify({ ok: true, sent: result.sent, yesterday: result.yesterday }));
};

export const config = {
  schedule: '0 6 * * *',
};
