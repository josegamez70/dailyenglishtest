export const ACADEMY_INVITE_KEY = 'academyInvite';
export const ACADEMY_INVITE_DISMISSED_KEY = 'academyInviteDismissed';

/** Uppercase invite code of 6 to 8 letters or digits. Empty when it cannot be a code. */
export function normalizeInviteCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 6 || cleaned.length > 8) return '';
  return cleaned;
}

/** "1 test", "0 tests", "2 lessons". */
export function countPhrase(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Full join link for this site, including deploy previews. */
export function inviteLink(origin: string, code: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/join?code=${encodeURIComponent(code)}`;
}

type CopyArea = {
  value: string;
  style: { position: string; left: string; top: string; opacity: string };
  setAttribute: (name: string, value: string) => void;
  focus: () => void;
  select: () => void;
};

/** Android browsers sometimes block navigator.clipboard. A hidden field still copies. */
export function copyWithHiddenTextarea(
  text: string,
  doc: {
    createElement: (tag: 'textarea') => CopyArea;
    body: { appendChild: (node: CopyArea) => void; removeChild: (node: CopyArea) => void };
    execCommand: (command: string) => boolean;
  },
): boolean {
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.focus();
    area.select();
    const copied = doc.execCommand('copy');
    doc.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export async function copyInviteText(
  text: string,
  tools?: {
    writeText?: (value: string) => Promise<void>;
    fallback?: (value: string) => boolean;
  },
): Promise<boolean> {
  const writeText = tools?.writeText
    ?? (typeof navigator !== 'undefined' && navigator.clipboard?.writeText
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : undefined);
  if (writeText) {
    try {
      await writeText(text);
      return true;
    } catch {
      /* try the hidden field */
    }
  }
  const fallback = tools?.fallback ?? ((value: string) => {
    if (typeof document === 'undefined') return false;
    return copyWithHiddenTextarea(value, document as unknown as Parameters<typeof copyWithHiddenTextarea>[1]);
  });
  return fallback(text);
}

/** Bold line on a student's pill. Display name, then the part of the email before @, then "Student". */
export function studentPillName(displayName: string | null | undefined, email: string | null | undefined): string {
  const person = String(displayName ?? '').replace(/\s+/g, ' ').trim();
  if (person) return person;
  const local = String(email ?? '').split('@')[0]?.trim() ?? '';
  if (local) return local;
  return 'Student';
}

/**
 * Public academy name. The owner's profile display name wins.
 * Otherwise the academy record name, then "Academy".
 */
export function academyPillName(ownerDisplayName: string | null | undefined, academyRecordName: string | null | undefined): string {
  const person = String(ownerDisplayName ?? '').replace(/\s+/g, ' ').trim();
  if (person) return person;
  const academy = String(academyRecordName ?? '').trim();
  return academy || 'Academy';
}

/** Signed-out invite banner. A null name means the academy name is not available yet. */
export function inviteBannerText(name: string | null): string {
  const academy = name?.trim() || 'an academy';
  return `You have been invited to join ${academy}. Sign in or create an account to join.`;
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
