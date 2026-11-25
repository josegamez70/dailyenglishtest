import type { SupabaseClient } from '@supabase/supabase-js';

type PilotProfile = {
  plan?: string | null;
  billing_provider?: string | null;
  pilot_expires_at?: string | null;
  pilot_invitation_id?: string | null;
};

/** A pilot academy stays open. A stored end date is not a limit. Paid academies are not pilots. */
export function ownerIsPilot(row: PilotProfile | null | undefined): boolean {
  if (!row || row.plan !== 'academy') return false;
  return row.billing_provider === 'pilot' || row.pilot_expires_at != null || row.pilot_invitation_id != null;
}

/** True for the pilot owner and for a student who is still in that academy. */
export async function pilotLessonsOpen(admin: SupabaseClient, userId: string): Promise<boolean> {
  const profile = await admin.from('profiles')
    .select('plan, billing_provider, pilot_expires_at, pilot_invitation_id')
    .eq('id', userId)
    .maybeSingle();
  if (ownerIsPilot(profile.data as PilotProfile | null)) return true;

  const membership = await admin.from('academy_members').select('academy_id').eq('user_id', userId).maybeSingle();
  const academyId = (membership.data as { academy_id?: string } | null)?.academy_id;
  if (!academyId) return false;
  const academy = await admin.from('academies').select('owner_id').eq('id', academyId).maybeSingle();
  const ownerId = (academy.data as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return false;
  const owner = await admin.from('profiles')
    .select('plan, billing_provider, pilot_expires_at, pilot_invitation_id')
    .eq('id', ownerId)
    .maybeSingle();
  return ownerIsPilot(owner.data as PilotProfile | null);
}
