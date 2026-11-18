import { presentBoard, SCOREBOARD_MIN, weightedPercent, type ModeTotals, type ScoreRow } from './scoreboard.ts';

export const SCOREBOARD_EMAIL_TOP = 5;

export type ScoreboardMailPerson = {
  userId: string;
  alias: string;
  optOut: boolean;
  alreadySent: boolean;
  row: ScoreRow;
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

function percentText(totals: ModeTotals, qualified: boolean): string {
  if (!qualified) return '—';
  const value = weightedPercent(totals.correct, totals.answered);
  return value == null ? '—' : `${value}%`;
}

/** Top 5 of each ranking. A learner in both lists gets one email that names both places. */
export function planScoreboardMail(
  people: readonly ScoreboardMailPerson[],
  day: string,
  optOutUrlFor: (alias: string) => string,
  minimum = SCOREBOARD_MIN,
): { recipients: ScoreboardMailRecipient[]; skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[] } {
  const rows = people.map((person) => person.row);
  const byExercises = presentBoard(rows, 'exercises', minimum).top.slice(0, SCOREBOARD_EMAIL_TOP);
  const byPercent = presentBoard(rows, 'percent', minimum).top.slice(0, SCOREBOARD_EMAIL_TOP);
  const skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[] = [];
  const recipients: ScoreboardMailRecipient[] = [];
  const seen = new Set<string>();
  const ordered = [...byExercises, ...byPercent];
  for (const shown of ordered) {
    const person = people.find((item) => item.row.alias === shown.alias && item.row.isSelf === shown.isSelf);
    if (!person || !person.userId || seen.has(person.userId)) continue;
    seen.add(person.userId);
    const exercisePlace = byExercises.find((item) => item.alias === person.alias)?.rank ?? null;
    const percentPlace = byPercent.find((item) => item.alias === person.alias)?.rank ?? null;
    if (person.optOut) {
      skipped.push({ alias: person.alias, reason: 'opt-out' });
      continue;
    }
    if (person.alreadySent) {
      skipped.push({ alias: person.alias, reason: 'already-sent' });
      continue;
    }
    const message = scoreboardAchievementMessage({
      exercisePlace,
      percentPlace,
      alias: person.alias,
      day,
      reading: person.row.reading,
      listening: person.row.listening,
      grammar: person.row.grammar,
      totalDone: shown.totalDone,
      totalCorrect: shown.totalCorrect,
      totalAnswered: shown.totalAnswered,
      optOutUrl: optOutUrlFor(person.alias),
    });
    recipients.push({
      userId: person.userId,
      position: percentPlace ?? exercisePlace ?? shown.rank ?? 0,
      alias: person.alias,
      readingDone: shown.reading.done,
      readingPercent: percentText(shown.reading, shown.qualified),
      listeningDone: shown.listening.done,
      listeningPercent: percentText(shown.listening, shown.qualified),
      grammarDone: shown.grammar.done,
      grammarPercent: percentText(shown.grammar, shown.qualified),
      totalDone: shown.totalDone,
      totalPercent: percentText({ done: shown.totalDone, correct: shown.totalCorrect, answered: shown.totalAnswered }, shown.qualified),
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
  return { recipients, skipped };
}

export function scoreboardAchievementMessage(input: {
  exercisePlace: number | null;
  percentPlace: number | null;
  alias: string;
  day: string;
  reading: ModeTotals;
  listening: ModeTotals;
  grammar: ModeTotals;
  totalDone: number;
  totalCorrect: number;
  totalAnswered: number;
  optOutUrl: string;
}): { subject: string; html: string; text: string } {
  const show = input.totalAnswered > 0;
  const totalPercent = percentText(
    { done: input.totalDone, correct: input.totalCorrect, answered: input.totalAnswered },
    show,
  );
  const lines = [
    `Reading: ${exerciseCount(input.reading.done)}, ${percentText(input.reading, input.reading.answered > 0)}`,
    `Listening: ${exerciseCount(input.listening.done)}, ${percentText(input.listening, input.listening.answered > 0)}`,
    `Grammar: ${exerciseCount(input.grammar.done)}, ${percentText(input.grammar, input.grammar.answered > 0)}`,
    `Total: ${exerciseCount(input.totalDone)}, ${totalPercent}`,
  ];
  const places = [
    input.exercisePlace ? `${ordinal(input.exercisePlace)} for Most exercises` : '',
    input.percentPlace ? `${ordinal(input.percentPlace)} for Best %` : '',
  ].filter(Boolean).join(' and ');
  const subject = 'Yesterday on the scoreboard';
  const text = [
    `${input.alias}, yesterday (${input.day}, Spain time) you were ${places}.`,
    ...lines,
    'The percent is correct answers divided by questions.',
    'This is practice. It is not a certificate and it does not promise a higher exam score.',
    `Stop these emails: ${input.optOutUrl}`,
  ].join('\n');
  const html = `<!doctype html>
<html>
<body style="margin:0;background:#c0c0c0;color:#000;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#c0c0c0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#c0c0c0;border:2px solid #fff;border-right-color:#404040;border-bottom-color:#404040;">
        <tr><td style="background:#000080;color:#fff;padding:8px 12px;font-family:monospace;font-size:20px;">Yesterday on the scoreboard</td></tr>
        <tr><td style="padding:16px;font-size:16px;line-height:1.5;">
          <p style="margin:0 0 12px;">${escapeHtml(input.alias)}, yesterday (${escapeHtml(input.day)}, Spain time) you were <strong>${escapeHtml(places)}</strong>.</p>
          <p style="margin:0 0 4px;">${escapeHtml(lines[0])}</p>
          <p style="margin:0 0 4px;">${escapeHtml(lines[1])}</p>
          <p style="margin:0 0 4px;">${escapeHtml(lines[2])}</p>
          <p style="margin:0 0 12px;"><strong>${escapeHtml(lines[3])}</strong></p>
          <p style="margin:0 0 12px;">The percent is correct answers divided by questions. This is practice. It is not a certificate and it does not promise a higher exam score.</p>
          <p style="margin:0;font-size:14px;"><a href="${escapeHtml(input.optOutUrl)}">Stop these emails</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}

function exerciseCount(done: number): string {
  return `${done} ${done === 1 ? 'exercise' : 'exercises'}`;
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
