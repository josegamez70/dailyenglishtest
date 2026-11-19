import { getSupabase } from './auth';
import { isMissingColumn, isMissingTable } from './studyStore';
import {
  clipVocabSpanish,
  normalizeTerm,
  rowsWithSaved,
  termKey,
  vocabMatchKeys,
  type SavedWord,
  type VocabSource,
  type VocabSpanishText,
} from './vocabulary';

export type VocabDraft = {
  term: string;
  meaning: string;
  example: string;
  spanishTerm?: string;
  spanishMeaning?: string;
  spanishExample?: string;
  sourceType: VocabSource;
  lessonTitle: string;
  topic: string;
  level: string;
};

const CORE_SELECT = 'id, term, meaning, example, source_type, lesson_title, topic, level, created_at, correct_count, wrong_count';
const FULL_SELECT = `${CORE_SELECT}, spanish_term, spanish_meaning, spanish_example`;

type VocabState = { rows: SavedWord[]; missing: boolean; notice: string | null };

let state: VocabState = { rows: [], missing: false, notice: null };
const listeners = new Set<() => void>();
const intent = new Map<string, { saved: boolean; draft: VocabDraft }>();
const running = new Set<string>();
const priorRows = new Map<string, SavedWord[]>();

function publish(next: { rows: SavedWord[]; missing?: boolean; notice?: string | null }) {
  state = {
    rows: next.rows,
    missing: next.missing ?? state.missing,
    notice: next.notice === undefined ? state.notice : next.notice,
  };
  listeners.forEach((listener) => listener());
}

function showNotice(message: string) {
  publish({ rows: state.rows, notice: message });
  window.setTimeout(() => {
    if (state.notice === message) publish({ rows: state.rows, notice: null });
  }, 3200);
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
    spanishTerm: clipVocabSpanish(String(row.spanish_term ?? ''), 80),
    spanishMeaning: clipVocabSpanish(String(row.spanish_meaning ?? ''), 400),
    spanishExample: clipVocabSpanish(String(row.spanish_example ?? ''), 400),
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
  let result = await supabase
    .from('saved_vocabulary')
    .select(FULL_SELECT)
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (result.error && isMissingColumn(result.error, 'spanish_term')) {
    result = await supabase
      .from('saved_vocabulary')
      .select(CORE_SELECT)
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
  }
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

function restoreTerm(key: string) {
  const prior = priorRows.get(key) ?? [];
  publish({
    rows: [...prior, ...state.rows.filter((row) => termKey(row.term) !== key)],
  });
  showNotice('Could not update that word.');
}

async function persistSave(draft: VocabDraft): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = getSupabase();
  const uid = await userId();
  const term = normalizeTerm(draft.term);
  const key = termKey(term);
  if (!term || !key) return { ok: false };
  if (!supabase || !uid) return { ok: false };
  const wanted = new Set(vocabMatchKeys(term));
  const existing = state.rows.find((row) => row.id && vocabMatchKeys(row.term).some((key) => wanted.has(key)));
  const payload = {
    user_id: uid,
    term: existing?.term || term,
    meaning: draft.meaning.replace(/\s+/g, ' ').trim().slice(0, 400),
    example: draft.example.replace(/\s+/g, ' ').trim().slice(0, 240),
    spanish_term: clipVocabSpanish(draft.spanishTerm || existing?.spanishTerm || '', 80),
    spanish_meaning: clipVocabSpanish(draft.spanishMeaning || existing?.spanishMeaning || '', 400),
    spanish_example: clipVocabSpanish(draft.spanishExample || existing?.spanishExample || '', 400),
    source_type: draft.sourceType,
    lesson_title: draft.lessonTitle.slice(0, 120),
    topic: draft.topic.slice(0, 80),
    level: draft.level.slice(0, 40),
  };
  const write = (body: Record<string, unknown>, columns: string) => (
    existing
      ? supabase.from('saved_vocabulary').update(body).eq('id', existing.id).eq('user_id', uid).select(columns).maybeSingle()
      : supabase.from('saved_vocabulary').insert(body).select(columns).maybeSingle()
  );
  let saved = await write(payload, FULL_SELECT);
  if (saved.error && isMissingColumn(saved.error, 'spanish_term')) {
    const core = { ...payload };
    delete core.spanish_term;
    delete core.spanish_meaning;
    delete core.spanish_example;
    saved = await write(core, CORE_SELECT);
  }
  if (saved.error) {
    if (isMissingTable(saved.error)) return { ok: false, missing: true };
    return { ok: false };
  }
  const parsed = saved.data ? rowFrom(saved.data as Record<string, unknown>) : null;
  const previous = state.rows.find((row) => termKey(row.term) === key);
  const kept = parsed ? keepSpanish(parsed, previous) : null;
  if (kept) priorRows.set(key, [kept]);
  if (intent.get(key)?.saved === false) return { ok: true };
  if (kept) {
    publish({ rows: [kept, ...state.rows.filter((row) => termKey(row.term) !== key)], missing: false });
  }
  return { ok: true };
}

async function persistRemove(term: string): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = getSupabase();
  const uid = await userId();
  const key = termKey(term);
  if (!key) return { ok: false };
  if (!supabase || !uid) return { ok: false };
  const matches = [...(priorRows.get(key) ?? []), ...state.rows.filter((row) => termKey(row.term) === key && row.id)];
  const ids = [...new Set(matches.map((row) => row.id).filter(Boolean))];
  if (!ids.length) return { ok: true };
  const removed = await supabase.from('saved_vocabulary').delete().eq('user_id', uid).in('id', ids);
  if (removed.error) {
    if (isMissingTable(removed.error)) return { ok: false, missing: true };
    return { ok: false };
  }
  priorRows.set(key, []);
  if (intent.get(key)?.saved === true) return { ok: true };
  publish({ rows: state.rows.filter((row) => termKey(row.term) !== key), missing: false });
  return { ok: true };
}

async function commitVocabulary(draft: VocabDraft, saved: boolean): Promise<{ ok: boolean; missing?: boolean }> {
  const term = normalizeTerm(draft.term);
  const key = termKey(term);
  if (!key) return { ok: false };
  const nextDraft = { ...draft, term };
  if (!running.has(key)) priorRows.set(key, state.rows.filter((row) => termKey(row.term) === key));
  intent.set(key, { saved, draft: nextDraft });
  publish({ rows: rowsWithSaved(state.rows, nextDraft, saved), notice: null });
  if (running.has(key)) return { ok: true };
  running.add(key);
  let result: { ok: boolean; missing?: boolean } = { ok: true };
  try {
    while (intent.has(key)) {
      const next = intent.get(key)!;
      intent.delete(key);
      result = next.saved ? await persistSave(next.draft) : await persistRemove(next.draft.term);
      if (!result.ok) {
        if (intent.has(key)) continue;
        if (result.missing) publish({ rows: state.rows, missing: true });
        restoreTerm(key);
        break;
      }
    }
  } finally {
    running.delete(key);
    if (!intent.has(key)) priorRows.delete(key);
  }
  return result;
}

export async function saveVocabularyWord(draft: VocabDraft): Promise<{ ok: boolean; missing?: boolean }> {
  return commitVocabulary(draft, true);
}

function keepSpanish(parsed: SavedWord, previous: SavedWord | undefined): SavedWord {
  if (!previous) return parsed;
  return {
    ...parsed,
    spanishTerm: parsed.spanishTerm || previous.spanishTerm,
    spanishMeaning: parsed.spanishMeaning || previous.spanishMeaning,
    spanishExample: parsed.spanishExample || previous.spanishExample,
  };
}

/** Remember a translation on the word so the next visit does not ask again. */
export async function saveVocabularySpanish(term: string, spanish: VocabSpanishText): Promise<{ stored: boolean }> {
  const key = termKey(term);
  if (!key) return { stored: false };
  const next = {
    spanishTerm: clipVocabSpanish(spanish.term, 80),
    spanishMeaning: clipVocabSpanish(spanish.meaning, 400),
    spanishExample: clipVocabSpanish(spanish.example, 400),
  };
  const current = state.rows.find((row) => termKey(row.term) === key);
  publish({
    rows: state.rows.map((row) => (termKey(row.term) === key ? { ...row, ...next } : row)),
  });
  const supabase = getSupabase();
  const uid = await userId();
  if (!supabase || !uid || !current?.id) return { stored: false };
  const saved = await supabase
    .from('saved_vocabulary')
    .update({
      spanish_term: next.spanishTerm,
      spanish_meaning: next.spanishMeaning,
      spanish_example: next.spanishExample,
    })
    .eq('id', current.id)
    .eq('user_id', uid);
  if (saved.error) return { stored: false };
  return { stored: true };
}

export async function removeVocabularyWord(term: string): Promise<{ ok: boolean; missing?: boolean }> {
  const existing = state.rows.find((row) => termKey(row.term) === termKey(term));
  return commitVocabulary({
    term,
    meaning: existing?.meaning || '',
    example: existing?.example || '',
    sourceType: existing?.sourceType || '',
    lessonTitle: existing?.lessonTitle || '',
    topic: existing?.topic || '',
    level: existing?.level || '',
  }, false);
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
