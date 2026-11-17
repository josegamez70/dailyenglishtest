import { accessToken, getSupabase } from './auth';
import { isMissingColumn, isMissingTable } from './studyStore';
import {
  isMissingListeningTopicColumn,
  isMissingVocabularyColumn,
  periodKey,
  readStoredVocabularyDone,
  readStoredVocabularyMode,
  settingsFromRow,
  settingsToRow,
  storeVocabularyDone,
  storeVocabularyMode,
  type TaskSettings,
} from './tasks';

export type TaskSlot = 'reading' | 'listening' | 'grammar' | 'vocabulary';

export type TaskPackClient = {
  id: string;
  periodKey: string;
  packSlot: number;
  createdAt: string;
  status: 'generating' | 'ready' | 'blocked' | string;
  blockReason: string;
  readingDone: boolean;
  listeningDone: boolean;
  grammarDone: boolean;
  vocabularyDone: boolean;
  reading: unknown;
  listening: unknown;
  grammar: unknown;
};

export type TaskStepResult = {
  ok?: boolean;
  missing?: boolean;
  busy?: boolean;
  blocked?: 'free_limit' | 'pilot_expired' | 'missing';
  step?: string;
  message?: string;
  packId?: string;
  lessonsUsed?: number;
};

function client() {
  return getSupabase();
}

export async function loadTaskScreen(settingsHint?: TaskSettings): Promise<{
  settings: TaskSettings;
  packs: TaskPackClient[];
  pack: TaskPackClient | null;
  missing: boolean;
}> {
  const supabase = client();
  const fallback = settingsFromRow(null);
  if (!supabase) return { settings: settingsHint ?? fallback, packs: [], pack: null, missing: false };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { settings: settingsHint ?? fallback, packs: [], pack: null, missing: false };
  const settingsResult = await supabase.from('task_settings').select('*').eq('user_id', userId).maybeSingle();
  if (settingsResult.error) {
    return { settings: settingsHint ?? fallback, packs: [], pack: null, missing: isMissingTable(settingsResult.error) };
  }
  const settingsRow = settingsResult.data as Record<string, unknown> | null;
  const modeColumn = !!settingsRow && Object.prototype.hasOwnProperty.call(settingsRow, 'vocabulary_mode');
  let settings = settingsRow
    ? settingsFromRow(settingsRow)
    : (settingsHint ?? fallback);
  if (!modeColumn && userId) {
    settings = { ...settings, vocabularyMode: readStoredVocabularyMode(userId) };
  }
  const key = periodKey(settings.frequency);
  const packResult = await supabase
    .from('task_packs')
    .select('id, period_key, pack_slot, status, block_reason, reading_done, listening_done, grammar_done, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (packResult.error) {
    return { settings, packs: [], pack: null, missing: isMissingTable(packResult.error) };
  }
  const rows = packResult.data ?? [];
  if (!rows.length) return { settings, packs: [], pack: null, missing: false };
  const exercises = await supabase
    .from('task_pack_exercises')
    .select('pack_id, reading, listening, grammar')
    .in('pack_id', rows.map((row) => row.id));
  const byPack = new Map((exercises.data ?? []).map((row) => [String(row.pack_id), row]));
  const packs: TaskPackClient[] = rows.map((row) => {
    const exercise = byPack.get(String(row.id));
    return {
      id: String(row.id),
      periodKey: String(row.period_key ?? key),
      packSlot: Number(row.pack_slot ?? 1),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      status: String(row.status ?? 'generating'),
      blockReason: String(row.block_reason ?? ''),
      readingDone: row.reading_done === true,
      listeningDone: row.listening_done === true,
      grammarDone: row.grammar_done === true,
      vocabularyDone: row.vocabulary_done === true || readStoredVocabularyDone(String(row.id)),
      reading: exercise?.reading ?? null,
      listening: exercise?.listening ?? null,
      grammar: exercise?.grammar ?? null,
    };
  });
  const today = packs.filter((item) => item.periodKey === key);
  return {
    settings,
    missing: false,
    packs,
    pack: today.find((item) => item.status !== 'ready' && item.status !== 'blocked') ?? today[0] ?? packs[0] ?? null,
  };
}

export async function saveTaskSettings(userId: string, settings: TaskSettings): Promise<{ ok: boolean; missing?: boolean; vocabularyLocal?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  storeVocabularyMode(userId, settings.vocabularyMode);
  const row = settingsToRow(userId, settings);
  const existing = await supabase.from('task_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (existing.error) return { ok: false, missing: isMissingTable(existing.error) };
  const write = (payload: Record<string, unknown>) => (
    existing.data
      ? supabase.from('task_settings').update(payload).eq('user_id', userId)
      : supabase.from('task_settings').insert(payload)
  );
  let saved = await write(row);
  let vocabularyLocal = false;
  if (saved.error && (isMissingListeningTopicColumn(saved.error) || isMissingVocabularyColumn(saved.error))) {
    const reduced = { ...row };
    if (isMissingListeningTopicColumn(saved.error)) delete reduced.listening_topic;
    if (isMissingVocabularyColumn(saved.error)) {
      delete reduced.vocabulary_mode;
      vocabularyLocal = true;
    }
    saved = await write(reduced);
    if (saved.error && isMissingVocabularyColumn(saved.error)) {
      delete reduced.vocabulary_mode;
      vocabularyLocal = true;
      saved = await write(reduced);
    }
    if (saved.error && isMissingListeningTopicColumn(saved.error)) {
      delete reduced.listening_topic;
      saved = await write(reduced);
    }
  }
  if (saved.error) return { ok: false, missing: isMissingTable(saved.error) };
  return { ok: true, vocabularyLocal };
}

export async function markTaskDone(packId: string, slot: TaskSlot): Promise<{ ok: boolean }> {
  const supabase = client();
  if (!supabase || !packId) return { ok: false };
  if (slot === 'vocabulary') {
    storeVocabularyDone(packId);
    const { error } = await supabase.from('task_packs').update({ vocabulary_done: true }).eq('id', packId);
    if (error && (isMissingColumn(error, 'vocabulary_done') || isMissingVocabularyColumn(error))) return { ok: true };
    return { ok: !error };
  }
  const column = slot === 'reading' ? 'reading_done' : slot === 'listening' ? 'listening_done' : 'grammar_done';
  const { error } = await supabase.from('task_packs').update({ [column]: true }).eq('id', packId);
  return { ok: !error };
}

export async function requestTaskStep(): Promise<TaskStepResult> {
  const token = await accessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers,
      body: '{}',
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as TaskStepResult;
    } catch {
      return { ok: false, message: 'The task pack could not be created. Please try again.' };
    }
  } catch {
    return { ok: false, message: 'The task pack took too long. Please try again.' };
  } finally {
    clearTimeout(timer);
  }
}
