import { getSupabase } from './auth';
import { profileHandle, usernameFormatError, usernameToken } from './profileHandle';

export type UsernameClaim = { ok: true; handle: string } | { ok: false; message: string };

/** Save a unique @ on the signed-in profile. The database function does the uniqueness check. */
export async function claimUsername(input: string): Promise<UsernameClaim> {
  const format = usernameFormatError(input);
  if (format) return { ok: false, message: format };
  const token = usernameToken(input);
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'Sign in to choose a username.' };
  const { data, error } = await supabase.rpc('claim_username', { candidate: token });
  if (error) {
    const message = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
    if (message.includes('username_taken')) return { ok: false, message: 'That username is taken.' };
    if (message.includes('username_format')) return { ok: false, message: 'Use 3 to 24 letters, numbers, or underscores.' };
    if (message.includes('username_signin')) return { ok: false, message: 'Sign in to choose a username.' };
    if (message.includes('does not exist') || message.includes('pgrst') || message.includes('42883') || message.includes('schema cache')) {
      return { ok: false, message: 'Usernames save after the database update.' };
    }
    return { ok: false, message: 'Could not save that username. Try again.' };
  }
  const saved = profileHandle(typeof data === 'string' ? data : token);
  if (!saved) return { ok: false, message: 'Could not save that username. Try again.' };
  return { ok: true, handle: saved };
}
