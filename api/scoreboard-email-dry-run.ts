import { secretMatches } from '../taskMail.ts';
import { planScoreboardEmailJob } from '../scoreboardEmailJob.ts';

/** Returns who would be mailed and the HTML. It never sends. */
export default async (req: Request) => {
  if (!secretMatches(req.headers.get('x-tasks-secret'))) {
    return new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), { status: 401 });
  }
  const plan = await planScoreboardEmailJob();
  const boards = plan.boards.map((board) => ({
    kind: board.kind,
    name: board.name,
    skipped: board.skipped,
    recipients: board.recipients.map((recipient) => ({
      position: recipient.position,
      alias: recipient.alias,
      subject: recipient.subject,
      html: recipient.html,
      text: recipient.text,
    })),
  }));
  return new Response(JSON.stringify({
    ok: true,
    enabled: plan.enabled,
    wouldSend: false,
    yesterday: plan.yesterday,
    missing: plan.missing === true,
    boards,
  }), { headers: { 'content-type': 'application/json' } });
};

export const config = {
  path: '/api/scoreboard-email-dry-run',
  method: 'POST',
};
