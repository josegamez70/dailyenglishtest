import { optOutScoreboardEmail } from '../scoreboardEmailJob.ts';

export default async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const ok = await optOutScoreboardEmail(token);
  const body = ok
    ? 'You will not receive the scoreboard email. Your results are unchanged.'
    : 'This link is not valid. Your results are unchanged.';
  return new Response(`<!doctype html><html><body style="font-family:Georgia,serif;padding:24px;"><p>${body}</p></body></html>`, {
    status: ok ? 200 : 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

export const config = {
  path: '/api/scoreboard-email-opt-out',
  method: 'GET',
};
