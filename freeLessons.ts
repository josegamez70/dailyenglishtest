/** Individual free accounts. Academy and paid plans do not use this number. */
export const FREE_LESSON_LIMIT = 12;

export const FREE_LIMIT_MESSAGE = `You have used your ${FREE_LESSON_LIMIT} free lessons. Premium is 3 € per month. These ${FREE_LESSON_LIMIT} lessons do not expire.`;

/** The old 12-lesson wall is off. Live Gemini lessons use a daily limit instead. */
export const LIVE_LESSON_DAILY_LIMIT = 5;

/** A signed-in free account is not stopped by the old 12-lesson count. */
export function freeAccountBlocked(input: {
  plan: string | null | undefined;
  lessonsLeft: number;
  academyRole?: 'owner' | 'student' | null;
}): boolean {
  void input.plan;
  void input.lessonsLeft;
  void input.academyRole;
  return false;
}
