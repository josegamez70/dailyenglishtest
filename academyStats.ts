export const ACADEMY_INVITE_KEY = 'academyInvite';
export const ACADEMY_INVITE_DISMISSED_KEY = 'academyInviteDismissed';

/** Uppercase invite code of 6 to 8 letters or digits. Empty when it cannot be a code. */
export function normalizeInviteCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 6 || cleaned.length > 8) return '';
  return cleaned;
}

export function joinResultMessage(result: string): string | null {
  if (result === 'ok') return null;
  if (result === 'invalid_code') return 'That code does not match an academy.';
  if (result === 'academy_full') return 'This academy is full.';
  if (result === 'already_member') return 'You already belong to an academy.';
  if (result === 'missing') return 'Academy joining will work after the database update.';
  return 'Could not join. Try again.';
}

/** Monday 00:00 in the local timezone. */
export function startOfLocalWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const fromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - fromMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function countTestsThisWeek(dates: Date[], now = new Date()): number {
  const start = startOfLocalWeek(now).getTime();
  const end = now.getTime();
  return dates.filter((date) => {
    const time = date.getTime();
    return time >= start && time <= end;
  }).length;
}
