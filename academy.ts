import { getSupabase } from './auth';
import { isMissingColumn, isMissingTable, readLessonMode, type LessonMode, type WrongAnswer } from './studyStore';

export type OwnedAcademy = {
  id: string;
  name: string;
  inviteCode: string;
  maxStudents: number;
};

export type StudentTest = {
  id: string;
  createdAt: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: LessonMode | null;
  wrongAnswers: WrongAnswer[];
};

export type AcademyStudent = {
  userId: string;
  email: string;
  displayName: string;
  /** Profile default level. Empty when the column is not available yet. */
  profileLevel: string;
  joinedAt: string;
  tests: StudentTest[];
};

function supabaseOrNull() {
  return getSupabase();
}

async function callText(name: string, args?: Record<string, unknown>): Promise<string> {
  const supabase = supabaseOrNull();
  if (!supabase) return 'error';
  const { data, error } = await supabase.rpc(name, args);
  if (error) return isMissingTable(error) ? 'missing' : 'error';
  return String(data ?? 'error');
}

export function createAcademy(name: string): Promise<string> {
  return callText('create_academy', { academy_name: name });
}

export function joinAcademy(code: string): Promise<string> {
  return callText('join_academy', { code });
}

export function leaveAcademy(): Promise<string> {
  return callText('leave_academy');
}

export function removeStudent(userId: string): Promise<string> {
  return callText('remove_student', { user_id: userId });
}

export function regenerateInviteCode(): Promise<string> {
  return callText('regenerate_invite_code');
}

export async function lookupAcademyName(code: string): Promise<{ name: string | null; missing: boolean }> {
  const supabase = supabaseOrNull();
  if (!supabase) return { name: null, missing: false };
  const { data, error } = await supabase.rpc('lookup_academy_name', { code });
  if (error) return { name: null, missing: isMissingTable(error) };
  return { name: data ? String(data) : null, missing: false };
}

export async function loadOwnedAcademy(): Promise<{ academy: OwnedAcademy | null; missing: boolean }> {
  const supabase = supabaseOrNull();
  if (!supabase) return { academy: null, missing: false };
  const { data, error } = await supabase
    .from('academies')
    .select('id, name, invite_code, max_students')
    .maybeSingle();
  if (error) return { academy: null, missing: isMissingTable(error) };
  if (!data) return { academy: null, missing: false };
  return {
    academy: {
      id: String(data.id),
      name: String(data.name ?? ''),
      inviteCode: String(data.invite_code ?? ''),
      maxStudents: Number(data.max_students ?? 8),
    },
    missing: false,
  };
}

export async function loadAcademyStudents(academyId: string): Promise<{ students: AcademyStudent[]; missing: boolean }> {
  const supabase = supabaseOrNull();
  if (!supabase) return { students: [], missing: false };
  const members = await supabase
    .from('academy_members')
    .select('user_id, joined_at')
    .eq('academy_id', academyId);
  if (members.error) return { students: [], missing: isMissingTable(members.error) };
  const ids = (members.data ?? []).map((row) => String(row.user_id));
  if (!ids.length) return { students: [], missing: false };
  const withLevel = await supabase.from('profiles').select('id, email, display_name, default_level').in('id', ids);
  const profiles = withLevel.error && isMissingColumn(withLevel.error, 'default_level')
    ? await supabase.from('profiles').select('id, email, display_name').in('id', ids)
    : withLevel;
  if (profiles.error) return { students: [], missing: isMissingTable(profiles.error) };
  // Owners can read these rows. RLS hides every other academy.
  const withMode = await supabase
    .from('test_results')
    .select('id, user_id, created_at, level, topic, title, score, total, mode, wrong_answers')
    .in('user_id', ids)
    .order('created_at', { ascending: false });
  const tests = withMode.error && isMissingColumn(withMode.error, 'mode')
    ? await supabase
      .from('test_results')
      .select('id, user_id, created_at, level, topic, title, score, total, wrong_answers')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
    : withMode;
  if (tests.error) return { students: [], missing: isMissingTable(tests.error) };
  const profileById = new Map((profiles.data ?? []).map((row) => {
    const record = row as { id?: unknown; email?: unknown; display_name?: unknown; default_level?: unknown };
    return [String(record.id), record] as const;
  }));
  const testsByUser = new Map<string, StudentTest[]>();
  for (const row of tests.data ?? []) {
    const userId = String(row.user_id);
    const list = testsByUser.get(userId) ?? [];
    list.push({
      id: String(row.id),
      createdAt: String(row.created_at),
      level: String(row.level ?? ''),
      topic: String(row.topic ?? ''),
      title: String(row.title ?? row.topic ?? ''),
      score: Number(row.score ?? 0),
      total: Number(row.total ?? 0),
      mode: readLessonMode('mode' in row ? row.mode : null),
      wrongAnswers: Array.isArray(row.wrong_answers) ? row.wrong_answers as WrongAnswer[] : [],
    });
    testsByUser.set(userId, list);
  }
  const students = (members.data ?? []).map((member) => {
    const userId = String(member.user_id);
    const profile = profileById.get(userId);
    return {
      userId,
      email: String(profile?.email ?? ''),
      displayName: String(profile?.display_name ?? ''),
      profileLevel: profile?.default_level == null ? '' : String(profile.default_level),
      joinedAt: String(member.joined_at ?? ''),
      tests: testsByUser.get(userId) ?? [],
    };
  });
  students.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
  return { students, missing: false };
}
