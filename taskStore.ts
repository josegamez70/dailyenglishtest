import { accessToken, getSupabase } from './auth';
import { isMissingTable } from './studyStore';
import {
  periodKey,
  settingsFromRow,
  settingsToRow,
  type TaskSettings,
} from './tasks';

export type TaskSlot = 'reading' | 'listening' | 'grammar';

export type TaskPackClient = {
  id: string;
  periodKey: string;
  status: 'generating' | 'ready' | 'blocked' | string;
  blockReason: string;
  readingDone: boolean;
  listeningDone: boolean;
  grammarDone: boolean;
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
};

function client() {
  return getSupabase();
}

export async function loadTaskScreen(settingsHint?: TaskSettings): Promise<{
  settings: TaskSettings;
  pack: TaskPackClient | null;
  missing: boolean;
}> {
  const supabase = client();
  const fallback = settingsFromRow(null);
  if (!supabase) return { settings: settingsHint ?? fallback, pack: null, missing: false };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { settings: settingsHint ?? fallback, pack: null, missing: false };
  const settingsResult = await supabase.from('task_settings').select('*').eq('user_id', userId).maybeSingle();
  if (settingsResult.error) {
    return { settings: settingsHint ?? fallback, pack: null, missing: isMissingTable(settingsResult.error) };
  }
  const settings = settingsResult.data
    ? settingsFromRow(settingsResult.data as Record<string, unknown>)
    : (settingsHint ?? fallback);
  const key = periodKey(settings.frequency);
  const packResult = await supabase
    .from('task_packs')
    .select('id, period_key, status, block_reason, reading_done, listening_done, grammar_done')
    .eq('user_id', userId)
    .eq('period_key', key)
    .maybeSingle();
  if (packResult.error) {
    return { settings, pack: null, missing: isMissingTable(packResult.error) };
  }
  if (!packResult.data) return { settings, pack: null, missing: false };
  const exercises = await supabase
    .from('task_pack_exercises')
    .select('reading, listening, grammar')
    .eq('pack_id', packResult.data.id)
    .maybeSingle();
  return {
    settings,
    missing: false,
    pack: {
      id: String(packResult.data.id),
      periodKey: String(packResult.data.period_key ?? key),
      status: String(packResult.data.status ?? 'generating'),
      blockReason: String(packResult.data.block_reason ?? ''),
      readingDone: packResult.data.reading_done === true,
      listeningDone: packResult.data.listening_done === true,
      grammarDone: packResult.data.grammar_done === true,
      reading: exercises.data?.reading ?? null,
      listening: exercises.data?.listening ?? null,
      grammar: exercises.data?.grammar ?? null,
    },
  };
}

export async function saveTaskSettings(userId: string, settings: TaskSettings): Promise<{ ok: boolean; missing?: boolean }> {
  const supabase = client();
  if (!supabase) return { ok: false };
  const row = settingsToRow(userId, settings);
  const existing = await supabase.from('task_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (existing.error) return { ok: false, missing: isMissingTable(existing.error) };
  const saved = existing.data
    ? await supabase.from('task_settings').update(row).eq('user_id', userId)
    : await supabase.from('task_settings').insert(row);
  if (saved.error) return { ok: false, missing: isMissingTable(saved.error) };
  return { ok: true };
}

export async function markTaskDone(packId: string, slot: TaskSlot): Promise<{ ok: boolean }> {
  const supabase = client();
  if (!supabase || !packId) return { ok: false };
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
