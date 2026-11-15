import { getSupabase } from './auth';
import { isMissingTable } from './studyStore';
import {
  normalizeTerm,
  termKey,
  type SavedWord,
  type VocabSource,
} from './vocabulary';

export type VocabDraft = {
  term: string;
  meaning: string;
  example: string;
  sourceType: VocabSource;
  lessonTitle: string;
  topic: string;
  level: string;
};

type VocabState = { rows: SavedWord[]; missing: boolean };

let state: VocabState = { rows: [], missing: false };
const listeners = new Set<() => void>();

function publish(next: VocabState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getVocabularyState(): VocabState {
  return state;
}

export function subscribeVocabulary(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function asSource(value: unknown): VocabSource {
  return value === 'reading' || value === 'listening' || value === 'lookup' ? value : '';
}

function rowFrom(row: Record<string, unknown>): SavedWord | null {
  const term = normalizeTerm(String(row.term ?? ''));
  if (!term) return null;
  return {
    id: String(row.id ?? ''),
    term,
    meaning: String(row.meaning ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    example: String(row.example ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
    sourceType: asSource(row.source_type),
    lessonTitle: String(row.lesson_title ?? '').slice(0, 120),
    topic: String(row.topic ?? '').slice(0, 80),
    level: String(row.level ?? '').slice(0, 40),
    createdAt: String(row.created_at ?? ''),
    correctCount: Number(row.correct_count ?? 0) || 0,
    wrongCount: Number(row.wrong_count ?? 0) || 0,
  };
}

async function userId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function loadVocabulary(): Promise<VocabState> {
  const supabase = getSupabase();
  const uid = await userId();
  if (!supabase || !uid) {
    publish({ rows: [], missing: false });
    return state;
  }
  const result = await supabase
    .from('saved_vocabulary')
    .select('id, term, meaning, example, source_type, lesson_title, topic, level, created_at, correct_count, wrong_count')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (result.error) {
    publish({ rows: [], missing: isMissingTable(result.error) });
    return state;
  }
  const rows = (result.data ?? []).flatMap((row) => {
    const parsed = rowFrom(row as Record<string, unknown>);
    return parsed ? [parsed] : [];
  });
  publish({ rows, missing: false });
  return state;
}

export function savedTermSet(rows: readonly SavedWord[] = state.rows): Set<string> {
  return new Set(rows.map((row) => termKey(row.term)));
}

export async function saveVocabularyWord(draft: VocabDraft): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = getSupabase();
  const uid = await userId();
  const term = normalizeTerm(draft.term);
  if (!term) return { ok: false };
  if (!supabase || !uid) return { ok: false };
  const payload = {
    user_id: uid,
    term,
    meaning: draft.meaning.replace(/\s+/g, ' ').trim().slice(0, 400),
    example: draft.example.replace(/\s+/g, ' ').trim().slice(0, 240),
    source_type: draft.sourceType,
    lesson_title: draft.lessonTitle.slice(0, 120),
    topic: draft.topic.slice(0, 80),
    level: draft.level.slice(0, 40),
  };
  const key = termKey(term);
  const existing = state.rows.find((row) => termKey(row.term) === key);
  const saved = existing
    ? await supabase.from('saved_vocabulary').update(payload).eq('id', existing.id).eq('user_id', uid).select('id, term, meaning, example, source_type, lesson_title, topic, level, created_at, correct_count, wrong_count').maybeSingle()
    : await supabase.from('saved_vocabulary').insert(payload).select('id, term, meaning, example, source_type, lesson_title, topic, level, created_at, correct_count, wrong_count').maybeSingle();
  if (saved.error) {
    if (isMissingTable(saved.error)) {
      publish({ rows: state.rows, missing: true });
      return { ok: false, missing: true };
    }
    return { ok: false };
  }
  const parsed = saved.data ? rowFrom(saved.data as Record<string, unknown>) : null;
  const rows = parsed
    ? [parsed, ...state.rows.filter((row) => termKey(row.term) !== key)]
    : state.rows;
  publish({ rows, missing: false });
  return { ok: true };
}

export async function removeVocabularyWord(term: string): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = getSupabase();
  const uid = await userId();
  const key = termKey(term);
  if (!key) return { ok: false };
  if (!supabase || !uid) return { ok: false };
  const matches = state.rows.filter((row) => termKey(row.term) === key);
  if (!matches.length) {
    publish({ rows: state.rows.filter((row) => termKey(row.term) !== key), missing: state.missing });
    return { ok: true };
  }
  const removed = await supabase.from('saved_vocabulary').delete().eq('user_id', uid).in('id', matches.map((row) => row.id));
  if (removed.error) {
    if (isMissingTable(removed.error)) {
      publish({ rows: state.rows, missing: true });
      return { ok: false, missing: true };
    }
    return { ok: false };
  }
  publish({ rows: state.rows.filter((row) => termKey(row.term) !== key), missing: false });
  return { ok: true };
}

export async function recordVocabAnswer(term: string, correct: boolean): Promise<void> {
  const supabase = getSupabase();
  const uid = await userId();
  const key = termKey(term);
  const current = state.rows.find((row) => termKey(row.term) === key);
  if (!supabase || !uid || !current?.id) return;
  const next = {
    correct_count: current.correctCount + (correct ? 1 : 0),
    wrong_count: current.wrongCount + (correct ? 0 : 1),
  };
  const saved = await supabase.from('saved_vocabulary').update(next).eq('id', current.id).eq('user_id', uid);
  if (saved.error) return;
  publish({
    rows: state.rows.map((row) => (
      row.id === current.id
        ? { ...row, correctCount: next.correct_count, wrongCount: next.wrong_count }
        : row
    )),
    missing: state.missing,
  });
}
