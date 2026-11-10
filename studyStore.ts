import { getSupabase } from './auth';
import { mergeSavedLessons, SAVED_LESSON_LIMIT } from './savedLessonMeta';

export type WrongAnswer = {
  question: string;
  userAnswer: string;
  correctAnswer: string;
};

export type LessonMode = 'reading' | 'listening' | 'grammar';

export type TestResultRow = {
  id: string;
  created_at: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: LessonMode | null;
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

export function isMissingColumn(error: { code?: string; message?: string } | null, column: string): boolean {
  const message = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  const name = column.toLowerCase();
  return message.includes('42703') || message.includes('pgrst204') || (message.includes(name) && (message.includes('column') || message.includes('schema cache')));
}

export function readLessonMode(value: unknown): LessonMode | null {
  return value === 'reading' || value === 'listening' || value === 'grammar' ? value : null;
}

export async function saveTestResult(input: {
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: LessonMode;
  wrongAnswers: WrongAnswer[];
}): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { ok: false };
  const row = {
    user_id: userId,
    level: input.level,
    topic: input.topic,
    title: input.title,
    score: input.score,
    total: input.total,
    mode: input.mode,
    wrong_answers: input.wrongAnswers,
  };
  const first = await supabase.from('test_results').insert(row);
  if (!first.error) return { ok: true };
  if (!isMissingColumn(first.error, 'mode')) return { ok: false, missing: isMissingTable(first.error) };
  const second = await supabase.from('test_results').insert({
    user_id: row.user_id,
    level: row.level,
    topic: row.topic,
    title: row.title,
    score: row.score,
    total: row.total,
    wrong_answers: row.wrong_answers,
  });
  if (second.error) return { ok: false, missing: isMissingTable(second.error) };
  return { ok: true };
}

export async function listTestResults(): Promise<{ rows: TestResultRow[]; missing: boolean }> {
  const supabase = client();
  if (!supabase) return { rows: [], missing: false };
  const withMode = await supabase
    .from('test_results')
    .select('id, created_at, level, topic, title, score, total, mode, wrong_answers')
    .order('created_at', { ascending: false });
  const fallback = withMode.error && isMissingColumn(withMode.error, 'mode')
    ? await supabase
      .from('test_results')
      .select('id, created_at, level, topic, title, score, total, wrong_answers')
      .order('created_at', { ascending: false })
    : null;
  const data = fallback ? fallback.data : withMode.data;
  const error = fallback ? fallback.error : withMode.error;
  if (error) return { rows: [], missing: isMissingTable(error) };
  const rows = (data ?? []).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    level: String(row.level ?? ''),
    topic: String(row.topic ?? ''),
    title: String(row.title ?? row.topic ?? ''),
    score: Number(row.score ?? 0),
    total: Number(row.total ?? 0),
    mode: readLessonMode('mode' in row ? row.mode : null),
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
  const extra = (listed.data ?? []).slice(SAVED_LESSON_LIMIT).map((row) => row.id);
  if (extra.length) await supabase.from('saved_lessons').delete().in('id', extra);
  return { ok: true };
}

function mapSavedRows(data: { id: unknown; created_at: unknown; title: unknown; lesson: unknown }[] | null): SavedLessonRow[] {
  return (data ?? []).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    title: String(row.title ?? 'Lesson'),
    lesson: row.lesson && typeof row.lesson === 'object' ? row.lesson as Record<string, unknown> : {},
  }));
}

export async function listSavedLessons(): Promise<{ rows: SavedLessonRow[]; missing: boolean; grammarMissing: boolean }> {
  const supabase = client();
  if (!supabase) return { rows: [], missing: false, grammarMissing: false };
  const { data, error } = await supabase
    .from('saved_lessons')
    .select('id, created_at, title, lesson')
    .order('created_at', { ascending: false })
    .limit(SAVED_LESSON_LIMIT);
  if (error) return { rows: [], missing: isMissingTable(error), grammarMissing: false };
  const practice = mapSavedRows(data);
  const grammar = await supabase
    .from('saved_grammar')
    .select('id, created_at, title, lesson')
    .order('created_at', { ascending: false })
    .limit(SAVED_LESSON_LIMIT);
  if (grammar.error) return { rows: practice, missing: false, grammarMissing: isMissingTable(grammar.error) };
  return { rows: mergeSavedLessons(practice, mapSavedRows(grammar.data)), missing: false, grammarMissing: false };
}

/** Store one grammar set. Older grammar sets past the newest 5 are removed. Reading and listening stay in saved_lessons. */
export async function saveGrammarLesson(lesson: Record<string, unknown>, title: string): Promise<{ ok: boolean; missing?: boolean; id?: string }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { ok: false };
  const inserted = await supabase
    .from('saved_grammar')
    .insert({ user_id: userId, title, lesson })
    .select('id')
    .single();
  if (inserted.error) return { ok: false, missing: isMissingTable(inserted.error) };
  const listed = await supabase
    .from('saved_grammar')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const extra = (listed.data ?? []).slice(SAVED_LESSON_LIMIT).map((row) => row.id);
  if (extra.length) await supabase.from('saved_grammar').delete().in('id', extra);
  return { ok: true, id: String(inserted.data.id) };
}

/** Replace the stored grammar set, including the learner's answers, without adding another row. */
export async function updateSavedGrammar(id: string, lesson: Record<string, unknown>): Promise<{ ok: boolean }> {
  const supabase = client();
  if (!supabase || !id) return { ok: false };
  const { error } = await supabase.from('saved_grammar').update({ lesson }).eq('id', id);
  return { ok: !error };
}

export async function updateProfileSettings(userId: string, patch: Record<string, unknown>): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) return { ok: false, missing: isMissingTable(error) };
  return { ok: true };
}
