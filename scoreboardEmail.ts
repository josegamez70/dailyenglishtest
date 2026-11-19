import { formatDuration, presentChallenge, type ChallengeLevel } from './dailyChallenge.ts';
import { legendMailStanding, type LegendMailStanding } from './legends.ts';
import { presentBoard, SCOREBOARD_MIN, weightedPercent, type ScoreRow } from './scoreboard.ts';

export const SCOREBOARD_EMAIL_TOP = 5;
const LEVELS: ChallengeLevel[] = ['B1', 'B2', 'C1'];
const DEFAULT_ASSET_BASE = 'https://dailyenglishtest.es';

export type ScoreboardMailPerson = {
  userId: string;
  alias: string;
  optOut: boolean;
  alreadySent: boolean;
  row: ScoreRow;
  lessons?: number;
  unlocked?: readonly string[];
};

export type ChallengeMailPerson = {
  userId: string;
  alias: string;
  level: ChallengeLevel;
  correct: number;
  total: number;
  seconds: number;
  optOut: boolean;
  alreadySent: boolean;
  lessons?: number;
  unlocked?: readonly string[];
};

export type ScoreboardMailRecipient = {
  userId: string;
  position: number;
  alias: string;
  subject: string;
  html: string;
  text: string;
};

type ListedLearner = {
  userId: string;
  alias: string;
  place: number;
  detail: string;
  lessons: number;
  unlocked: readonly string[];
  optOut: boolean;
  alreadySent: boolean;
};

/** Top 5 of yesterday's challenge, per level, and yesterday's percent ranking. Sending stays behind the flag. */
export function planScoreboardMail(input: {
  people: readonly ScoreboardMailPerson[];
  challenges?: readonly ChallengeMailPerson[];
  day: string;
  optOutUrlFor: (alias: string) => string;
  assetBase?: string;
  minimum?: number;
  legendsReady?: boolean;
  challengeReady?: boolean;
}): { recipients: ScoreboardMailRecipient[]; skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[] } {
  const challenges = input.challenges ?? [];
  const legendsReady = input.legendsReady !== false;
  const challengeReady = input.challengeReady !== false;
  const assetBase = cleanBase(input.assetBase);
  const yesterday = rankYesterday(input.people, input.minimum ?? SCOREBOARD_MIN);
  const byLevel = LEVELS.map((level) => ({
    level,
    rows: rankChallenge(challenges.filter((person) => person.level === level)),
  }));
  const listed = [...yesterday, ...byLevel.flatMap((section) => section.rows)];
  const skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[] = [];
  const recipients: ScoreboardMailRecipient[] = [];
  const seen = new Set<string>();
  for (const row of listed) {
    if (!row.userId || seen.has(row.userId)) continue;
    seen.add(row.userId);
    if (row.optOut) {
      skipped.push({ alias: row.alias, reason: 'opt-out' });
      continue;
    }
    if (row.alreadySent) {
      skipped.push({ alias: row.alias, reason: 'already-sent' });
      continue;
    }
    const places = listed.filter((item) => item.userId === row.userId).map((item) => item.place);
    const message = scoreboardBoardMessage({
      day: input.day,
      alias: row.alias,
      challenge: byLevel,
      yesterday,
      optOutUrl: input.optOutUrlFor(row.alias),
      assetBase,
      legendsReady,
      challengeReady,
    });
    recipients.push({
      userId: row.userId,
      position: Math.min(...places),
      alias: row.alias,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
  return { recipients, skipped };
}

export function scoreboardBoardMessage(input: {
  day: string;
  alias: string;
  challenge: { level: ChallengeLevel; rows: readonly ListedLearner[] }[];
  yesterday: readonly ListedLearner[];
  optOutUrl: string;
  assetBase?: string;
  legendsReady?: boolean;
  challengeReady?: boolean;
}): { subject: string; html: string; text: string } {
  const assetBase = cleanBase(input.assetBase);
  const legendsReady = input.legendsReady !== false;
  const challengeReady = input.challengeReady !== false;
  const subject = 'Yesterday on the scoreboard';
  const challengeBlocks = challengeReady
    ? input.challenge.map((section) => renderLevel(section.level, section.rows, assetBase, legendsReady))
    : [{
      heading: '',
      text: 'Yesterday\'s challenge ranking will show after the database update.',
      html: '<p style="margin:0 0 12px;">Yesterday\'s challenge ranking will show after the database update.</p>',
    }];
  const yesterdayBlock = renderRows(input.yesterday, assetBase, legendsReady);
  const text = [
    `Hello ${input.alias}.`,
    `Yesterday (${input.day}, Spain time).`,
    '',
    "Yesterday's daily challenge",
    'Ranked by combined percent. A shorter time breaks a tie.',
    ...challengeBlocks.flatMap((block) => ['', block.heading, block.text].filter((line) => line !== '')),
    '',
    'Yesterday',
    'Ranked by percent correct among learners with at least 3 exercises.',
    yesterdayBlock.text || 'No one reached 3 exercises yesterday.',
    '',
    'This is practice. It is not a certificate and it does not promise a higher exam score.',
    `Stop these emails: ${input.optOutUrl}`,
  ].join('\n');
  const html = `<!doctype html>
<html>
<body style="margin:0;background:#c0c0c0;color:#000;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#c0c0c0;padding:16px 8px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#c0c0c0;border:2px solid #fff;border-right-color:#404040;border-bottom-color:#404040;">
        <tr><td style="background:#000080;color:#fff;padding:8px 12px;font-family:monospace;font-size:20px;">Yesterday on the scoreboard</td></tr>
        <tr><td style="padding:16px;font-size:16px;line-height:1.45;">
          <p style="margin:0 0 8px;">Hello ${escapeHtml(input.alias)}.</p>
          <p style="margin:0 0 16px;">Yesterday (${escapeHtml(input.day)}, Spain time).</p>
          <h2 style="margin:0 0 6px;font-size:18px;">Yesterday's daily challenge</h2>
          <p style="margin:0 0 10px;">Ranked by combined percent. A shorter time breaks a tie.</p>
          ${challengeBlocks.map((block) => block.html).join('')}
          <h2 style="margin:16px 0 6px;font-size:18px;">Yesterday</h2>
          <p style="margin:0 0 10px;">Ranked by percent correct among learners with at least 3 exercises.</p>
          ${yesterdayBlock.html || '<p style="margin:0 0 12px;">No one reached 3 exercises yesterday.</p>'}
          <p style="margin:16px 0 12px;">This is practice. It is not a certificate and it does not promise a higher exam score.</p>
          <p style="margin:0;font-size:14px;"><a href="${escapeHtml(input.optOutUrl)}">Stop these emails</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}

/** Fictitious aliases for the sample. None of these names are learners. */
export function sampleScoreboardMail(): { subject: string; html: string; text: string } {
  const rookie = ['rookie', 'first_steps', 'retro_player'];
  const challenge: ChallengeMailPerson[] = [
    sampleChallenge('Demo Alba', 'B1', 15, 15, 490, 38, rookie),
    sampleChallenge('Demo Bruno', 'B1', 14, 15, 542, 12, ['rookie', 'first_steps']),
    sampleChallenge('Demo Celia', 'B1', 14, 15, 700, 0, []),
    sampleChallenge('Demo Diego', 'B1', 12, 15, 440, 50, [...rookie, 'arcade_starter']),
    sampleChallenge('Demo Elena', 'B1', 10, 15, 610, 6, ['rookie']),
    sampleChallenge('Demo Felix', 'B2', 13, 15, 800, 27, rookie),
    sampleChallenge('Demo Gema', 'B2', 11, 15, 640, 10, ['rookie', 'first_steps']),
    sampleChallenge('Demo Hugo', 'B2', 9, 15, 500, 4, []),
    sampleChallenge('Demo Ines', 'C1', 12, 15, 900, 100, [...rookie, 'arcade_starter', 'century_club']),
  ];
  const people: ScoreboardMailPerson[] = [
    samplePerson('Demo Alba', 4, 32, 40, 38, rookie),
    samplePerson('Demo Bruno', 4, 24, 40, 12, ['rookie', 'first_steps']),
    samplePerson('Demo Nora', 3, 18, 30, 0, []),
    samplePerson('Demo Oscar', 5, 20, 40, 25, rookie),
    samplePerson('Demo Paz', 3, 12, 30, 9, ['rookie']),
    samplePerson('Demo Quique', 3, 6, 30, 2, []),
  ];
  const plan = planScoreboardMail({
    people,
    challenges: challenge,
    day: '2026-11-18',
    optOutUrlFor: () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview',
    assetBase: DEFAULT_ASSET_BASE,
  });
  const message = plan.recipients[0];
  return { subject: message?.subject ?? 'Yesterday on the scoreboard', html: message?.html ?? '', text: message?.text ?? '' };
}

function sampleChallenge(
  alias: string,
  level: ChallengeLevel,
  correct: number,
  total: number,
  seconds: number,
  lessons: number,
  unlocked: string[],
): ChallengeMailPerson {
  return { userId: alias, alias, level, correct, total, seconds, optOut: false, alreadySent: false, lessons, unlocked };
}

function samplePerson(
  alias: string,
  done: number,
  correct: number,
  answered: number,
  lessons: number,
  unlocked: string[],
): ScoreboardMailPerson {
  return {
    userId: alias,
    alias,
    optOut: false,
    alreadySent: false,
    lessons,
    unlocked,
    row: {
      alias,
      isSelf: false,
      demo: true,
      reading: { done, correct, answered },
      listening: { done: 0, correct: 0, answered: 0 },
      grammar: { done: 0, correct: 0, answered: 0 },
    },
  };
}

function rankYesterday(people: readonly ScoreboardMailPerson[], minimum: number): ListedLearner[] {
  const shown = presentBoard(people.map((person) => person.row), minimum).top.slice(0, SCOREBOARD_EMAIL_TOP);
  return shown.flatMap((row) => {
    const person = people.find((item) => item.row.alias === row.alias && item.row.isSelf === row.isSelf);
    if (!person?.userId || row.rank == null) return [];
    const percent = weightedPercent(row.totalCorrect, row.totalAnswered);
    return [{
      userId: person.userId,
      alias: person.alias,
      place: row.rank,
      detail: `${percent == null ? '—' : `${percent}%`} · ${row.totalDone} ${row.totalDone === 1 ? 'exercise' : 'exercises'}`,
      lessons: person.lessons ?? 0,
      unlocked: person.unlocked ?? [],
      optOut: person.optOut,
      alreadySent: person.alreadySent,
    }];
  });
}

function rankChallenge(people: readonly ChallengeMailPerson[]): ListedLearner[] {
  const ranked = presentChallenge(people.map((person) => ({
    alias: person.alias,
    isSelf: false,
    demo: false,
    correct: person.correct,
    total: person.total,
    seconds: person.seconds,
  }))).top.slice(0, SCOREBOARD_EMAIL_TOP);
  return ranked.flatMap((row) => {
    const person = people.find((item) => item.alias === row.alias);
    if (!person?.userId) return [];
    const percent = weightedPercent(person.correct, person.total);
    return [{
      userId: person.userId,
      alias: person.alias,
      place: row.rank,
      detail: `${percent == null ? '—' : `${percent}%`} · ${formatDuration(person.seconds)}`,
      lessons: person.lessons ?? 0,
      unlocked: person.unlocked ?? [],
      optOut: person.optOut,
      alreadySent: person.alreadySent,
    }];
  });
}

function renderLevel(level: ChallengeLevel, rows: readonly ListedLearner[], assetBase: string, legendsReady: boolean) {
  const body = rows.length
    ? renderRows(rows, assetBase, legendsReady)
    : { text: `No one finished ${level} yesterday.`, html: `<p style="margin:0 0 12px;">No one finished ${escapeHtml(level)} yesterday.</p>` };
  return {
    heading: level,
    text: [level, body.text].join('\n'),
    html: `<h3 style="margin:12px 0 6px;font-size:16px;">${escapeHtml(level)}</h3>${body.html}`,
  };
}

function renderRows(rows: readonly ListedLearner[], assetBase: string, legendsReady: boolean): { text: string; html: string } {
  if (!rows.length) return { text: '', html: '' };
  const text = rows.map((row) => {
    const standing = standingFor(row, legendsReady);
    const badge = standing.badge?.name ?? (legendsReady ? 'No Retro Legend yet' : 'Retro Legends will show after the database update.');
    return `${ordinal(row.place)}, ${honorText(row.place)}. ${row.alias}. ${badge}. ${legendsReady ? standing.nextLine : ''} ${row.detail}`.replace(/\s+/g, ' ').trim();
  }).join('\n');
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows.map((row) => rowHtml(row, assetBase, legendsReady)).join('')}</table>`;
  return { text, html };
}

function rowHtml(row: ListedLearner, assetBase: string, legendsReady: boolean): string {
  const standing = standingFor(row, legendsReady);
  const badge = badgeHtml(standing, assetBase, legendsReady);
  return `<tr>
    <td style="padding:8px 8px 8px 0;vertical-align:top;width:88px;">${honorHtml(row.place, assetBase)}</td>
    <td style="padding:8px 0;vertical-align:top;">
      <p style="margin:0 0 4px;font-weight:bold;">${escapeHtml(row.alias)}</p>
      ${badge}
      <p style="margin:4px 0 0;">${escapeHtml(row.detail)}</p>
    </td>
  </tr>`;
}

function badgeHtml(standing: LegendMailStanding, assetBase: string, legendsReady: boolean): string {
  if (!legendsReady) {
    return '<p style="margin:0;">Retro Legends will show after the database update.</p>';
  }
  const icon = standing.badge
    ? `<img src="${escapeHtml(assetUrl(assetBase, standing.badge.icon))}" width="32" height="32" alt="" style="display:inline-block;vertical-align:middle;margin-right:6px;border:0;">`
    : '';
  const name = standing.badge?.name ?? 'No Retro Legend yet';
  return `<p style="margin:0;">${icon}${escapeHtml(name)}</p><p style="margin:2px 0 0;">${escapeHtml(standing.nextLine)}</p>`;
}

function honorHtml(place: number, assetBase: string): string {
  if (place >= 1 && place <= 3) {
    const color = place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze';
    const label = honorText(place);
    return `<img src="${escapeHtml(assetUrl(assetBase, `/icons/medal_${color}.png`))}" width="32" height="32" alt="${escapeHtml(label)}" style="display:block;border:0;"><span style="display:block;font-size:13px;margin-top:2px;">${escapeHtml(ordinal(place))}</span>`;
  }
  return `<span style="display:block;font-weight:bold;">Special mention</span><span style="display:block;font-size:13px;margin-top:2px;">${escapeHtml(ordinal(place))}</span>`;
}

function honorText(place: number): string {
  if (place === 1) return 'Gold medal';
  if (place === 2) return 'Silver medal';
  if (place === 3) return 'Bronze medal';
  return 'Special mention';
}

function standingFor(row: ListedLearner, legendsReady: boolean): LegendMailStanding {
  if (!legendsReady) return { lessons: 0, badge: null, nextLine: '' };
  return legendMailStanding(row.lessons, row.unlocked);
}

function ordinal(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}

function cleanBase(value: string | undefined): string {
  const raw = (value || DEFAULT_ASSET_BASE).replace(/\/+$/, '');
  return raw || DEFAULT_ASSET_BASE;
}

function assetUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
