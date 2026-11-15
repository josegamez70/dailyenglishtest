import { normalizeInviteCode } from './academyStats.ts';

/** The only text an academy should paste into WhatsApp: one full join link. */
export function inviteShareText(origin: string, code: string): string {
  const base = origin.replace(/\/+$/, '');
  const clean = normalizeInviteCode(code);
  if (!clean) return '';
  return `${base}/join?code=${encodeURIComponent(clean)}`;
}

/** True when the clipboard holds that one link and no second address. */
export function inviteTextIsSingleJoinLink(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed !== text || /\s/.test(trimmed)) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
  if (url.pathname !== '/join') return false;
  const code = normalizeInviteCode(url.searchParams.get('code') || '');
  if (!code || url.search !== `?code=${code}`) return false;
  return true;
}

const CRAWLER = /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|pinterest|vkshare/i;

export function isInviteCrawler(userAgent: string): boolean {
  return CRAWLER.test(userAgent);
}

export function escapeInviteHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Drop a name that would become a second link in the chat preview. */
export function publicAcademyName(value: string | null | undefined): string | null {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return null;
  if (/https?:|www\.|@/i.test(name)) return null;
  return name;
}

export function invitePreviewMeta(input: { joinUrl: string; academyName: string | null }): {
  title: string;
  description: string;
  url: string;
} {
  const name = publicAcademyName(input.academyName);
  return {
    title: name ? `Invitation to join ${name} on Daily English Test` : 'Academy invitation',
    description: 'Tap to join your academy. This opens the academy invite, not the general sign-up page.',
    url: input.joinUrl,
  };
}

/** A small document for chat apps. The only link is the join URL. */
export function invitePreviewHtml(input: { joinUrl: string; academyName: string | null }): string {
  const meta = invitePreviewMeta(input);
  const title = escapeInviteHtml(meta.title);
  const description = escapeInviteHtml(meta.description);
  const url = escapeInviteHtml(meta.url);
  return `<!DOCTYPE html>
<html lang="en" translate="no" class="notranslate">
<head>
<meta charset="utf-8" />
<meta name="google" content="notranslate" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Daily English Test" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:url" content="${url}" />
</head>
<body>
<p><a href="${url}">${title}</a></p>
<p>${description}</p>
</body>
</html>`;
}
