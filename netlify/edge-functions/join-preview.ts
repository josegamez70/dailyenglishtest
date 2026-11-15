import type { Config } from '@netlify/edge-functions';
import { invitePreviewHtml, isInviteCrawler, publicAcademyName } from '../../invitePreview.ts';
import { normalizeInviteCode } from '../../academyStats.ts';

async function academyName(code: string): Promise<string | null> {
  const supabaseUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
  const key = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const academyRes = await fetch(
    `${supabaseUrl}/rest/v1/academies?invite_code=eq.${encodeURIComponent(code)}&select=name,owner_id`,
    { headers },
  );
  if (!academyRes.ok) return null;
  const academies = await academyRes.json() as { name?: string; owner_id?: string }[];
  const academy = Array.isArray(academies) ? academies[0] : null;
  if (!academy) return null;
  let display = '';
  if (academy.owner_id) {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(academy.owner_id)}&select=display_name`,
      { headers },
    );
    if (profileRes.ok) {
      const profiles = await profileRes.json() as { display_name?: string }[];
      display = String(profiles?.[0]?.display_name ?? '');
    }
  }
  return publicAcademyName(display) || publicAcademyName(academy.name);
}

export default async (req: Request) => {
  if (!isInviteCrawler(req.headers.get('user-agent') || '')) return;
  const url = new URL(req.url);
  const code = normalizeInviteCode(url.searchParams.get('code') || '');
  const joinUrl = code ? `${url.origin}/join?code=${code}` : `${url.origin}/join`;
  const name = code ? await academyName(code).catch(() => null) : null;
  return new Response(invitePreviewHtml({ joinUrl, academyName: name }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};

export const config: Config = {
  path: ['/join', '/join/'],
  onError: 'bypass',
};
