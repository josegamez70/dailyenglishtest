/** Individual free accounts. Academy and paid plans do not use this number. */
export const FREE_LESSON_LIMIT = 12;

export const FREE_LIMIT_MESSAGE = `You have used your ${FREE_LESSON_LIMIT} free lessons. Premium is 3 € per month. These ${FREE_LESSON_LIMIT} lessons do not expire.`;

/** A signed-in free account with nothing left. Academy members and paid plans are not blocked here. */
export function freeAccountBlocked(input: {
  plan: string | null | undefined;
  lessonsLeft: number;
  academyRole?: 'owner' | 'student' | null;
}): boolean {
  if (input.academyRole === 'owner' || input.academyRole === 'student') return false;
  if (input.plan && input.plan !== 'free') return false;
  return input.lessonsLeft <= 0;
}
