import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  appBaseUrl,
  readEnvValue,
  readSmtpSettings,
  runtimeEnv,
  sendSmtpMail,
  type EnvMap,
} from './taskMail.ts';
import { madridDayKey, shiftMadridDay } from './tasks.ts';
import { elapsedSeconds, type ChallengeLevel } from './dailyChallenge.ts';
import { planScoreboardMail, type ChallengeMailPerson, type ScoreboardMailPerson, type ScoreboardMailRecipient } from './scoreboardEmail.ts';
import { rowFromAttempts, type ScoreAttempt } from './scoreboard.ts';

export function scoreboardEmailsEnabled(env: EnvMap): boolean {
  return readEnvValue(env, 'SCOREBOARD_EMAILS_ENABLED') === 'true';
}

export type ScoreboardEmailBoard = {
  kind: 'academy' | 'individual';
  name: string;
  recipients: ScoreboardMailRecipient[];
  skipped: { alias: string; reason: 'opt-out' | 'already-sent' }[];
};

export type ScoreboardEmailPlan = {
  enabled: boolean;
  wouldSend: boolean;
  yesterday: string;
  boards: ScoreboardEmailBoard[];
  missing?: boolean;
};

type ProfileRow = {
  id?: unknown;
  display_name?: unknown;
  scoreboard_alias?: unknown;
  scoreboard_email_opt_out?: unknown;
};

function adminClient(env: EnvMap): SupabaseClient | null {
  const url = readEnvValue(env, 'SUPABASE_URL');
  const key = readEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function chosenAlias(alias: string, displayName: string, userId: string): string {
  const picked = alias.trim();
  if (picked && !picked.includes('@')) return picked.slice(0, 40);
  const name = displayName.trim();
  if (name && !name.includes('@')) return name.slice(0, 40);
  return `Learner ${userId.slice(0, 4).toUpperCase()}`;
}

export async function planScoreboardEmailJob(env: EnvMap = runtimeEnv()): Promise<ScoreboardEmailPlan> {
  const yesterday = shiftMadridDay(madridDayKey(new Date()), -1);
  const enabled = scoreboardEmailsEnabled(env);
  const admin = adminClient(env);
  if (!admin) return { enabled, wouldSend: false, yesterday, boards: [], missing: true };
  const [academies, members, profiles, results, sends, attempts, lessons, badges] = await Promise.all([
    admin.from('academies').select('id, name, owner_id'),
    admin.from('academy_members').select('academy_id, user_id'),
    admin.from('profiles').select('id, display_name, scoreboard_alias, scoreboard_email_opt_out'),
    admin.from('test_results').select('user_id, mode, score, total, created_at'),
    admin.from('scoreboard_email_sends').select('user_id, madrid_day').eq('madrid_day', yesterday),
    admin.from('daily_challenge_attempts').select('user_id, level, correct, total, started_at, submitted_at').eq('madrid_day', yesterday).not('submitted_at', 'is', null),
    admin.from('lesson_completions').select('user_id, modality'),
    admin.from('user_achievements').select('user_id, achievement_id'),
  ]);
  if (academies.error || members.error || profiles.error || results.error) {
    return { enabled, wouldSend: false, yesterday, boards: [], missing: true };
  }
  const legendsReady = !lessons.error && !badges.error;
  const challengeReady = !attempts.error;
  const lessonCount = new Map<string, number>();
  if (legendsReady) {
    for (const row of lessons.data ?? []) {
      const record = row as { user_id?: unknown; modality?: unknown };
      const userId = String(record.user_id ?? '');
      const modality = String(record.modality ?? '');
      if (!userId || !['reading', 'listening', 'grammar', 'vocabulary'].includes(modality)) continue;
      lessonCount.set(userId, (lessonCount.get(userId) ?? 0) + 1);
    }
  }
  const unlockedByUser = new Map<string, string[]>();
  if (legendsReady) {
    for (const row of badges.data ?? []) {
      const record = row as { user_id?: unknown; achievement_id?: unknown };
      const userId = String(record.user_id ?? '');
      const id = String(record.achievement_id ?? '');
      if (!userId || !id) continue;
      const list = unlockedByUser.get(userId) ?? [];
      list.push(id);
      unlockedByUser.set(userId, list);
    }
  }
  const attemptByUser = new Map<string, { level: ChallengeLevel; correct: number; total: number; seconds: number }>();
  if (challengeReady) {
    for (const row of attempts.data ?? []) {
      const record = row as { user_id?: unknown; level?: unknown; correct?: unknown; total?: unknown; started_at?: unknown; submitted_at?: unknown };
      const userId = String(record.user_id ?? '');
      const level = record.level === 'B1' || record.level === 'B2' || record.level === 'C1' ? record.level : null;
      if (!userId || !level) continue;
      attemptByUser.set(userId, {
        level,
        correct: Number(record.correct ?? 0),
        total: Number(record.total ?? 0),
        seconds: elapsedSeconds(String(record.started_at ?? ''), String(record.submitted_at ?? '')),
      });
    }
  }
  const sent = new Set((sends.data ?? []).map((row) => String((row as { user_id?: unknown }).user_id)));
  const profileById = new Map((profiles.data ?? []).map((row) => [String((row as ProfileRow).id), row as ProfileRow]));
  const memberIds = new Set((members.data ?? []).map((row) => String((row as { user_id?: unknown }).user_id)));
  const ownerIds = new Set((academies.data ?? []).map((row) => String((row as { owner_id?: unknown }).owner_id ?? '')));
  const attemptsByUser = new Map<string, ScoreAttempt[]>();
  for (const row of results.data ?? []) {
    const record = row as { user_id?: unknown; mode?: unknown; score?: unknown; total?: unknown; created_at?: unknown };
    const userId = String(record.user_id ?? '');
    const list = attemptsByUser.get(userId) ?? [];
    const mode = record.mode === 'reading' || record.mode === 'listening' || record.mode === 'grammar' ? record.mode : null;
    list.push({
      mode,
      score: Number(record.score ?? 0),
      total: Number(record.total ?? 0),
      createdAt: String(record.created_at ?? ''),
    });
    attemptsByUser.set(userId, list);
  }
  const personFor = (userId: string): ScoreboardMailPerson => {
    const profile = profileById.get(userId);
    const alias = chosenAlias(String(profile?.scoreboard_alias ?? ''), String(profile?.display_name ?? ''), userId);
    const row = rowFromAttempts(alias, attemptsByUser.get(userId) ?? [], 'yesterday', new Date(), false);
    return {
      userId,
      alias,
      optOut: profile?.scoreboard_email_opt_out === true,
      alreadySent: sent.has(userId),
      row,
      lessons: lessonCount.get(userId) ?? 0,
      unlocked: unlockedByUser.get(userId) ?? [],
    };
  };
  const challengeFor = (userId: string): ChallengeMailPerson | null => {
    const attempt = attemptByUser.get(userId);
    if (!attempt || attempt.total <= 0) return null;
    const person = personFor(userId);
    return {
      userId,
      alias: person.alias,
      level: attempt.level,
      correct: attempt.correct,
      total: attempt.total,
      seconds: attempt.seconds,
      optOut: person.optOut,
      alreadySent: person.alreadySent,
      lessons: person.lessons,
      unlocked: person.unlocked,
    };
  };
  const boards: ScoreboardEmailBoard[] = [];
  const base = appBaseUrl(env) ?? 'https://dailyenglishtest.es';
  const link = () => `${base}/api/scoreboard-email-opt-out?token=preview`;
  const mailFor = (people: ScoreboardMailPerson[], ids: string[]) => planScoreboardMail({
    people,
    challenges: ids.flatMap((id) => {
      const row = challengeFor(id);
      return row ? [row] : [];
    }),
    day: yesterday,
    optOutUrlFor: link,
    assetBase: base,
    legendsReady,
    challengeReady,
  });
  for (const academy of academies.data ?? []) {
    const record = academy as { id?: unknown; name?: unknown; owner_id?: unknown };
    const id = String(record.id ?? '');
    const people = (members.data ?? [])
      .filter((row) => String((row as { academy_id?: unknown }).academy_id) === id)
      .map((row) => personFor(String((row as { user_id?: unknown }).user_id)));
    const ownerId = String(record.owner_id ?? '');
    if (ownerId && !people.some((person) => person.userId === ownerId)) people.push(personFor(ownerId));
    const plan = mailFor(people, people.map((person) => person.userId));
    boards.push({ kind: 'academy', name: String(record.name ?? 'Academy'), ...plan });
  }
  const individuals = [...profileById.keys()]
    .filter((id) => id && !memberIds.has(id) && !ownerIds.has(id))
    .map((id) => personFor(id));
  boards.push({ kind: 'individual', name: 'Individual learners', ...mailFor(individuals, individuals.map((person) => person.userId)) });
  const wouldSend = enabled && boards.some((board) => board.recipients.length > 0);
  return { enabled, wouldSend, yesterday, boards };
}

export async function deliverScoreboardEmails(env: EnvMap = runtimeEnv()): Promise<ScoreboardEmailPlan & { sent: number }> {
  const plan = await planScoreboardEmailJob(env);
  if (!scoreboardEmailsEnabled(env)) return { ...plan, enabled: false, wouldSend: false, sent: 0 };
  const settings = readSmtpSettings(env);
  const base = appBaseUrl(env);
  const admin = adminClient(env);
  if (!settings || !base || !admin) return { ...plan, wouldSend: false, sent: 0, missing: true };
  let sent = 0;
  for (const board of plan.boards) {
    for (const recipient of board.recipients) {
      const token = await ensureToken(admin, recipient.userId);
      const html = recipient.html.replace('token=preview', `token=${encodeURIComponent(token)}`);
      const text = recipient.text.replace('token=preview', `token=${encodeURIComponent(token)}`);
      const inserted = await admin.from('scoreboard_email_sends').insert({
        user_id: recipient.userId,
        madrid_day: plan.yesterday,
        board: board.kind,
      });
      if (inserted.error) continue;
      const to = await emailForUser(admin, recipient.userId);
      if (!to.includes('@')) {
        await admin.from('scoreboard_email_sends').delete().eq('user_id', recipient.userId).eq('madrid_day', plan.yesterday);
        continue;
      }
      try {
        await sendSmtpMail(settings, { to, subject: recipient.subject, html, text });
        sent += 1;
      } catch {
        await admin.from('scoreboard_email_sends').delete().eq('user_id', recipient.userId).eq('madrid_day', plan.yesterday);
      }
    }
  }
  return { ...plan, sent };
}

async function emailForUser(admin: SupabaseClient, userId: string): Promise<string> {
  const result = await admin.auth.admin.getUserById(userId);
  return result.data.user?.email ?? '';
}

async function ensureToken(admin: SupabaseClient, userId: string): Promise<string> {
  const existing = await admin.from('scoreboard_email_tokens').select('token').eq('user_id', userId).maybeSingle();
  const current = String((existing.data as { token?: unknown } | null)?.token ?? '');
  if (current) return current;
  const token = randomBytes(24).toString('hex');
  await admin.from('scoreboard_email_tokens').insert({ user_id: userId, token });
  return token;
}

export async function optOutScoreboardEmail(token: string, env: EnvMap = runtimeEnv()): Promise<boolean> {
  const admin = adminClient(env);
  const clean = token.trim();
  if (!admin || clean.length < 16) return false;
  const found = await admin.from('scoreboard_email_tokens').select('user_id').eq('token', clean).maybeSingle();
  const userId = String((found.data as { user_id?: unknown } | null)?.user_id ?? '');
  if (!userId) return false;
  const updated = await admin.from('profiles').update({ scoreboard_email_opt_out: true }).eq('id', userId);
  return !updated.error;
}
