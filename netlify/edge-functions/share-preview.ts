import type { Config } from '@netlify/edge-functions';
import { escapeInviteHtml, isInviteCrawler } from '../../invitePreview.ts';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  if (!isInviteCrawler(req.headers.get('user-agent') || '')) return;
  const url = new URL(req.url);
  const id = url.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  if (!ID.test(id)) return;
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !key) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/read_shared_exercise`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
  });
  if (!response.ok) return;
  const row = await response.json() as { handle?: string; score?: number | null; payload?: { title?: string } } | null;
  const title = String(row?.payload?.title ?? 'Daily English Test').slice(0, 80);
  const handle = String(row?.handle ?? '').replace(/^@/, '');
  const who = handle ? `@${handle}` : '';
  const description = row?.score == null
    ? (who ? `Can you try this exercise? — ${who}` : 'Can you try this exercise?')
    : (who ? `I scored ${row.score}% — can you beat it? — ${who}` : `I scored ${row.score}% — can you beat it?`);
  const safeTitle = escapeInviteHtml(title);
  const safeDescription = escapeInviteHtml(description);
  const safeUrl = escapeInviteHtml(url.href);
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Daily English Test" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDescription}" />
<meta property="og:url" content="${safeUrl}" />
</head>
<body><p>${safeTitle}</p><p>${safeDescription}</p></body>
</html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};

export const config: Config = {
  path: '/s/*',
  onError: 'bypass',
};
