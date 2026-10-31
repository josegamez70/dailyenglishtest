import { getSupabase } from './auth';

export type WrongAnswer = {
  question: string;
  userAnswer: string;
  correctAnswer: string;
};

export type TestResultRow = {
  id: string;
  created_at: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  wrong_answers: WrongAnswer[];
};

export type SavedLessonRow = {
  id: string;
  created_at: string;
  title: string;
  lesson: Record<string, unknown>;
};

function client() {
  return getSupabase();
}

export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return message.includes('42p01') || message.includes('pgrst') || message.includes('does not exist') || message.includes('schema cache');
}

export async function saveTestResult(input: {
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  wrongAnswers: WrongAnswer[];
}): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { ok: false };
  const { error } = await supabase.from('test_results').insert({
    user_id: userId,
    level: input.level,
    topic: input.topic,
    title: input.title,
    score: input.score,
    total: input.total,
    wrong_answers: input.wrongAnswers,
  });
  if (error) return { ok: false, missing: isMissingTable(error) };
  return { ok: true };
}

export async function listTestResults(): Promise<{ rows: TestResultRow[]; missing: boolean }> {
  const supabase = client();
  if (!supabase) return { rows: [], missing: false };
  const { data, error } = await supabase
    .from('test_results')
    .select('id, created_at, level, topic, title, score, total, wrong_answers')
    .order('created_at', { ascending: false });
  if (error) return { rows: [], missing: isMissingTable(error) };
  const rows = (data ?? []).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    level: String(row.level ?? ''),
    topic: String(row.topic ?? ''),
    title: String(row.title ?? row.topic ?? ''),
    score: Number(row.score ?? 0),
    total: Number(row.total ?? 0),
    wrong_answers: Array.isArray(row.wrong_answers) ? row.wrong_answers as WrongAnswer[] : [],
  }));
  return { rows, missing: false };
}

export async function saveLesson(lesson: Record<string, unknown>, title: string): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { ok: false };
  const { error } = await supabase.from('saved_lessons').insert({
    user_id: userId,
    title,
    lesson,
  });
  if (error) return { ok: false, missing: isMissingTable(error) };
  const listed = await supabase
    .from('saved_lessons')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const extra = (listed.data ?? []).slice(5).map((row) => row.id);
  if (extra.length) await supabase.from('saved_lessons').delete().in('id', extra);
  return { ok: true };
}

export async function listSavedLessons(): Promise<{ rows: SavedLessonRow[]; missing: boolean }> {
  const supabase = client();
  if (!supabase) return { rows: [], missing: false };
  const { data, error } = await supabase
    .from('saved_lessons')
    .select('id, created_at, title, lesson')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return { rows: [], missing: isMissingTable(error) };
  return {
    rows: (data ?? []).map((row) => ({
      id: String(row.id),
      created_at: String(row.created_at),
      title: String(row.title ?? 'Lesson'),
      lesson: row.lesson && typeof row.lesson === 'object' ? row.lesson as Record<string, unknown> : {},
    })),
    missing: false,
  };
}

export async function updateProfileSettings(userId: string, patch: Record<string, unknown>): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) return { ok: false, missing: isMissingTable(error) };
  return { ok: true };
}
