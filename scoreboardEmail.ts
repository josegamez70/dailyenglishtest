import { formatDuration, presentChallenge, type ChallengeLevel } from './dailyChallenge.ts';
import { presentBoard, SCOREBOARD_MIN, weightedPercent, type ModeTotals, type ScoreRow } from './scoreboard.ts';

export const SCOREBOARD_EMAIL_TOP = 5;
const LEVELS: ChallengeLevel[] = ['B1', 'B2', 'C1'];

export type ScoreboardMailPerson = {
  userId: string;
  alias: string;
  optOut: boolean;
  alreadySent: boolean;
  /** Yesterday's exercises. */
  row: ScoreRow;
  /** Every saved exercise. Defaults to yesterday when omitted. */
  allTime?: ScoreRow;
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
};

export type ScoreboardMailRecipient = {
  userId: string;
  position: number;
  alias: string;
  readingDone: number;
  readingPercent: string;
  listeningDone: number;
  listeningPercent: string;
  grammarDone: number;
  grammarPercent: string;
  totalDone: number;
  totalPercent: string;
  subject: string;
  html: string;
  text: string;
};

type Listed = {
  userId: string;
  alias: string;
  place: number;
  detail: string;
  optOut: boolean;
  alreadySent: boolean;
  readingDone: number;
  readingPercent: string;
  listeningDone: number;
  listeningPercent: string;
  grammarDone: number;
  grammarPercent: string;
  totalDone: number;
  totalPercent: string;
};

function percentText(totals: ModeTotals, qualified: boolean): string {
  if (!qualified) return '—';
  const value = weightedPercent(totals.correct, totals.answered);
  return value == null ? '—' : `${value}%`;
}

/**
 * One email for anyone in a top 5: yesterday's challenge (each level), yesterday's percent, or all time.
 * Sending stays behind SCOREBOARD_EMAILS_ENABLED.
 */
export function planScoreboardMail(
  people: readonly ScoreboardMailPerson[],
  day: string,
  optOutUrlFor: (alias: string) => string,
  minimum = SCOREBOARD_MIN,
  challenges: readonly ChallengeMailPerson[] = [],
  challengeReady = true,
): { recipients: ScoreboardMailRecipient[]; skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[] } {
  const yesterday = rankExercises(people, 'row', minimum);
  const allTime = rankExercises(people, 'allTime', minimum);
  const challenge = LEVELS.map((level) => ({
    level,
    rows: rankChallenge(challenges.filter((person) => person.level === level)),
  }));
  const listed = [...yesterday, ...allTime, ...challenge.flatMap((section) => section.rows)];
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
      day,
      alias: row.alias,
      challenge,
      yesterday,
      allTime,
      optOutUrl: optOutUrlFor(row.alias),
      challengeReady,
    });
    recipients.push({
      userId: row.userId,
      position: Math.min(...places),
      alias: row.alias,
      readingDone: row.readingDone,
      readingPercent: row.readingPercent,
      listeningDone: row.listeningDone,
      listeningPercent: row.listeningPercent,
      grammarDone: row.grammarDone,
      grammarPercent: row.grammarPercent,
      totalDone: row.totalDone,
      totalPercent: row.totalPercent,
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
  challenge: { level: ChallengeLevel; rows: readonly Listed[] }[];
  yesterday: readonly Listed[];
  allTime: readonly Listed[];
  optOutUrl: string;
  challengeReady?: boolean;
}): { subject: string; html: string; text: string } {
  const challengeReady = input.challengeReady !== false;
  const subject = 'Yesterday on the scoreboard';
  const challengeText = challengeReady
    ? input.challenge.map((section) => [section.level, sectionText(section.rows, `No one finished ${section.level} yesterday.`)].join('\n')).join('\n\n')
    : 'Yesterday\'s challenge ranking will show after the database update.';
  const challengeHtml = challengeReady
    ? input.challenge.map((section) => `<h3 style="margin:12px 0 6px;font-size:16px;">${escapeHtml(section.level)}</h3>${sectionHtml(section.rows, `No one finished ${section.level} yesterday.`)}`).join('')
    : '<p style="margin:0 0 12px;">Yesterday\'s challenge ranking will show after the database update.</p>';
  const text = [
    `Hello ${input.alias}.`,
    `Yesterday (${input.day}, Spain time).`,
    '',
    'Daily challenge',
    'Yesterday\'s challenge at each level. Ranked by combined percent. A shorter time breaks a tie.',
    challengeText,
    '',
    'Yesterday',
    'Ranked by percent correct among learners with at least 3 exercises.',
    sectionText(input.yesterday, 'No one reached 3 exercises yesterday.'),
    '',
    'All time',
    'Ranked by percent correct among learners with at least 3 exercises.',
    sectionText(input.allTime, 'No one has reached 3 exercises yet.'),
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
          <h2 style="margin:0 0 6px;font-size:18px;">Daily challenge</h2>
          <p style="margin:0 0 10px;">Yesterday's challenge at each level. Ranked by combined percent. A shorter time breaks a tie.</p>
          ${challengeHtml}
          <h2 style="margin:16px 0 6px;font-size:18px;">Yesterday</h2>
          <p style="margin:0 0 10px;">Ranked by percent correct among learners with at least 3 exercises.</p>
          ${sectionHtml(input.yesterday, 'No one reached 3 exercises yesterday.')}
          <h2 style="margin:16px 0 6px;font-size:18px;">All time</h2>
          <p style="margin:0 0 10px;">Ranked by percent correct among learners with at least 3 exercises.</p>
          ${sectionHtml(input.allTime, 'No one has reached 3 exercises yet.')}
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
  const people: ScoreboardMailPerson[] = [
    samplePerson('Demo Alba', 4, 32, 40, 40, 180, 200),
    samplePerson('Demo Bruno', 4, 24, 40, 30, 90, 150),
    samplePerson('Demo Nora', 3, 18, 30, 20, 70, 120),
    samplePerson('Demo Oscar', 5, 20, 40, 12, 40, 80),
    samplePerson('Demo Paz', 3, 12, 30, 8, 20, 40),
    samplePerson('Demo Quique', 3, 6, 30, 4, 8, 20),
  ];
  const challenges: ChallengeMailPerson[] = [
    sampleChallenge('Demo Alba', 'B1', 15, 15, 490),
    sampleChallenge('Demo Bruno', 'B1', 14, 15, 542),
    sampleChallenge('Demo Celia', 'B1', 14, 15, 700),
    sampleChallenge('Demo Diego', 'B1', 12, 15, 440),
    sampleChallenge('Demo Elena', 'B1', 10, 15, 610),
    sampleChallenge('Demo Felix', 'B2', 13, 15, 800),
    sampleChallenge('Demo Gema', 'B2', 11, 15, 640),
    sampleChallenge('Demo Hugo', 'B2', 9, 15, 500),
    sampleChallenge('Demo Ines', 'C1', 12, 15, 900),
  ];
  const plan = planScoreboardMail(
    people,
    '2026-11-18',
    () => 'https://dailyenglishtest.es/api/scoreboard-email-opt-out?token=preview',
    SCOREBOARD_MIN,
    challenges,
  );
  const message = plan.recipients[0];
  return { subject: message?.subject ?? 'Yesterday on the scoreboard', html: message?.html ?? '', text: message?.text ?? '' };
}

function samplePerson(
  alias: string,
  yesterdayDone: number,
  yesterdayCorrect: number,
  yesterdayAnswered: number,
  allDone: number,
  allCorrect: number,
  allAnswered: number,
): ScoreboardMailPerson {
  return {
    userId: alias,
    alias,
    optOut: false,
    alreadySent: false,
    row: scoreRow(alias, yesterdayDone, yesterdayCorrect, yesterdayAnswered),
    allTime: scoreRow(alias, allDone, allCorrect, allAnswered),
  };
}

function sampleChallenge(alias: string, level: ChallengeLevel, correct: number, total: number, seconds: number): ChallengeMailPerson {
  return { userId: `challenge-${alias}-${level}`, alias, level, correct, total, seconds, optOut: false, alreadySent: false };
}

function scoreRow(alias: string, done: number, correct: number, answered: number): ScoreRow {
  return {
    alias,
    isSelf: false,
    demo: true,
    reading: { done, correct, answered },
    listening: { done: 0, correct: 0, answered: 0 },
    grammar: { done: 0, correct: 0, answered: 0 },
  };
}

function rankExercises(people: readonly ScoreboardMailPerson[], field: 'row' | 'allTime', minimum: number): Listed[] {
  const shown = presentBoard(people.map((person) => person[field] ?? person.row), minimum).top.slice(0, SCOREBOARD_EMAIL_TOP);
  return shown.flatMap((row) => {
    const person = people.find((item) => (item[field] ?? item.row).alias === row.alias);
    if (!person?.userId || row.rank == null) return [];
    const percent = weightedPercent(row.totalCorrect, row.totalAnswered);
    return [{
      ...statsOf(person.row),
      userId: person.userId,
      alias: person.alias,
      place: row.rank,
      detail: `${percent == null ? '—' : `${percent}%`} · ${row.totalDone} ${row.totalDone === 1 ? 'exercise' : 'exercises'}`,
      optOut: person.optOut,
      alreadySent: person.alreadySent,
    }];
  });
}

function rankChallenge(people: readonly ChallengeMailPerson[]): Listed[] {
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
    const empty = { done: 0, correct: 0, answered: 0 };
    return [{
      userId: person.userId,
      alias: person.alias,
      place: row.rank,
      detail: `${percent == null ? '—' : `${percent}%`} · ${formatDuration(person.seconds)}`,
      optOut: person.optOut,
      alreadySent: person.alreadySent,
      readingDone: 0,
      readingPercent: percentText(empty, false),
      listeningDone: 0,
      listeningPercent: percentText(empty, false),
      grammarDone: 0,
      grammarPercent: percentText(empty, false),
      totalDone: 0,
      totalPercent: percent == null ? '—' : `${percent}%`,
    }];
  });
}

function statsOf(row: ScoreRow): Pick<Listed, 'readingDone' | 'readingPercent' | 'listeningDone' | 'listeningPercent' | 'grammarDone' | 'grammarPercent' | 'totalDone' | 'totalPercent'> {
  const total = {
    done: row.reading.done + row.listening.done + row.grammar.done,
    correct: row.reading.correct + row.listening.correct + row.grammar.correct,
    answered: row.reading.answered + row.listening.answered + row.grammar.answered,
  };
  return {
    readingDone: row.reading.done,
    readingPercent: percentText(row.reading, row.reading.answered > 0),
    listeningDone: row.listening.done,
    listeningPercent: percentText(row.listening, row.listening.answered > 0),
    grammarDone: row.grammar.done,
    grammarPercent: percentText(row.grammar, row.grammar.answered > 0),
    totalDone: total.done,
    totalPercent: percentText(total, total.answered > 0),
  };
}

function sectionText(rows: readonly Listed[], empty: string): string {
  if (!rows.length) return empty;
  return rows.map((row) => `${ordinal(row.place)}. ${row.alias}. ${row.detail}`).join('\n');
}

function sectionHtml(rows: readonly Listed[], empty: string): string {
  if (!rows.length) return `<p style="margin:0 0 12px;">${escapeHtml(empty)}</p>`;
  const body = rows.map((row) => `<tr><td style="padding:4px 8px 4px 0;vertical-align:top;font-weight:bold;">${escapeHtml(ordinal(row.place))}</td><td style="padding:4px 0;">${escapeHtml(row.alias)} · ${escapeHtml(row.detail)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${body}</table>`;
}

function ordinal(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
