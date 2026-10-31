import { useCallback, useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const FREE_LESSON_LIMIT = 3;

/** Free accounts show the remaining lessons. Other plans show a name only. */
export function planStatusText(plan: string | null, lessonsLeft: number): string | null {
  if (!plan) return null;
  if (plan === 'free') return `Free lessons left: ${lessonsLeft} of ${FREE_LESSON_LIMIT}`;
  if (plan === 'pro') return 'Premium';
  if (plan === 'tester') return 'Tester';
  if (plan === 'academy') return 'Academy';
  return plan;
}

export const FREE_LIMIT_MESSAGE = 'You have used your 3 free lessons. Premium is coming soon: 5 € per month.';

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

export async function sendMagicLink(email: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Sign-in is not set up yet.');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function accessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useAccount() {
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [lessonsUsed, setLessonsUsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<string | null>(null);
  const [defaultLevel, setDefaultLevel] = useState<string | null>(null);
  const [voice, setVoice] = useState<'british' | 'american'>('british');
  const [speed, setSpeed] = useState(1);
  const [displayName, setDisplayName] = useState('');

  const applyProfile = (data: Record<string, unknown>) => {
    setPlan(String(data.plan ?? 'free'));
    setLessonsUsed(Number(data.lessons_used ?? 0));
    if (data.theme != null) setTheme(String(data.theme));
    if (data.default_level != null) setDefaultLevel(String(data.default_level));
    if (data.voice === 'american' || data.voice === 'british') setVoice(data.voice);
    const nextSpeed = Number(data.speed);
    if (nextSpeed === 0.75 || nextSpeed === 1 || nextSpeed === 1.25) setSpeed(nextSpeed);
    if (data.display_name != null) setDisplayName(String(data.display_name).slice(0, 40));
  };

  const refreshProfile = useCallback(async (id?: string) => {
    const supabase = getSupabase();
    const profileId = id ?? userId;
    if (!supabase || !profileId) return;
    const full = await supabase
      .from('profiles')
      .select('plan, lessons_used, theme, default_level, voice, speed, display_name')
      .eq('id', profileId)
      .maybeSingle();
    if (!full.error && full.data) {
      applyProfile(full.data as Record<string, unknown>);
      return;
    }
    const basic = await supabase.from('profiles').select('plan, lessons_used').eq('id', profileId).maybeSingle();
    if (!basic.error && basic.data) applyProfile(basic.data as Record<string, unknown>);
  }, [userId]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setReady(true);
      return undefined;
    }
    let ignore = false;
    supabase.auth.getSession().then(({ data }) => {
      if (ignore) return;
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      if (user) void refreshProfile(user.id);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      if (user) void refreshProfile(user.id);
      else {
        setPlan(null);
        setLessonsUsed(0);
      }
    });
    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const lessonsLeft = Math.max(0, FREE_LESSON_LIMIT - lessonsUsed);
  return {
    email,
    userId,
    plan,
    lessonsUsed,
    lessonsLeft,
    ready,
    theme,
    defaultLevel,
    voice,
    speed,
    displayName,
    signedIn: Boolean(userId),
    refreshProfile,
  };
}
