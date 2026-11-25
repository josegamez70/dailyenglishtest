/** Individual free accounts. Academy and paid plans do not use this number. */
export const FREE_LESSON_LIMIT = 12;

export const FREE_LIMIT_MESSAGE = `You have used your ${FREE_LESSON_LIMIT} free lessons. Premium is 3 € per month. These ${FREE_LESSON_LIMIT} lessons do not expire.`;

/** Typed custom topics only. List topics and Any topic are not counted. */
export const CUSTOM_TOPIC_DAILY_LIMIT = 5;

export function customTopicLimitMessage(limit = CUSTOM_TOPIC_DAILY_LIMIT): string {
  const count = Math.max(1, Math.floor(limit) || CUSTOM_TOPIC_DAILY_LIMIT);
  return `You have used today's ${count} custom topics. Choose a topic from the list, or Any topic. Those lessons come from the saved bank.`;
}

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
