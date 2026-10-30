import { useCallback, useEffect, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const FREE_LESSON_LIMIT = 3;
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

  const refreshProfile = useCallback(async (id?: string) => {
    const supabase = getSupabase();
    const profileId = id ?? userId;
    if (!supabase || !profileId) return;
    const { data } = await supabase.from('profiles').select('plan, lessons_used').eq('id', profileId).maybeSingle();
    if (!data) return;
    setPlan(String(data.plan ?? 'free'));
    setLessonsUsed(Number(data.lessons_used ?? 0));
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
    signedIn: Boolean(userId),
    refreshProfile,
  };
}
