import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionStatus = 'pending' | 'approved' | 'restored';

const LOCKING_STATUSES: DeletionStatus[] = ['pending', 'approved'];

export interface PendingDeletionRow {
  id: string;
  displayName: string;
  requestedAt: string;
}

export function isLockedOut(status: DeletionStatus | null): boolean {
  return status !== null && LOCKING_STATUSES.includes(status);
}

// Returns the status of the user's open request, or null if there is none.
// A failed lookup also returns null, so a database error doesn't lock everyone out.
export async function getOpenDeletionStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<DeletionStatus | null> {
  const { data } = await supabase
    .from('deletion_requests')
    .select('status')
    .eq('user_id', userId)
    .in('status', LOCKING_STATUSES)
    .maybeSingle();

  return (data?.status as DeletionStatus | undefined) ?? null;
}

export function pendingCountLabel(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1 ? '1 pending deletion request' : `${count} pending deletion requests`;
}

export function displayName(
  profile: { first_name: string; last_name: string } | null,
  email: string
): string {
  const name = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';
  return name || email;
}
