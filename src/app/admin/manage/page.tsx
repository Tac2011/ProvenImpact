import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleInfo, type UserRole } from '@/lib/roles';
import { displayName, pendingCountLabel, type PendingDeletionRow } from '@/lib/deletionRequests';
import { DeletionRequestList } from '../DeletionRequestList';

const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: 'Main Admin',
  corporate_admin: 'Corporate Admin',
  corporate_user: 'Corporate User',
  university_admin: 'University Admin',
  university_user: 'University User',
  student_athlete: 'Student Athlete',
};

export default async function AdminManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const info = await getUserRoleInfo(supabase, user.id);

  if (info.role !== 'platform_admin') {
    redirect('/profile');
  }

  const dateAdded = info.createdAt
    ? new Date(info.createdAt).toLocaleDateString()
    : 'Not set';

  const { data: requests } = await supabase
    .from('deletion_requests')
    .select('id, user_id, email, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  const pending = requests ?? [];
  const userIds = pending.map((r) => r.user_id);

  // No foreign key links deletion_requests to profiles, so names come from a second query.
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
      : { data: [] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: PendingDeletionRow[] = pending.map((r) => ({
    id: r.id,
    displayName: displayName(profileById.get(r.user_id) ?? null, r.email),
    requestedAt: r.requested_at,
  }));

  const countLabel = pendingCountLabel(rows.length);

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      {countLabel ? (
        <section className="mt-6">
          <div className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm font-medium">
            {countLabel}
          </div>
          <DeletionRequestList adminId={user.id} rows={rows} />
        </section>
      ) : (
        <p className="mt-6 text-sm text-gray-600">No pending deletion requests.</p>
      )}

      <h2 className="mt-10 text-lg font-semibold">Your admin account</h2>
      <dl className="mt-4 flex flex-col gap-4 text-sm">
        <div>
          <dt className="font-medium text-gray-500">Name</dt>
          <dd>{info.name ?? 'Not set'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Admin Type</dt>
          <dd>{ROLE_LABELS[info.role]}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Organization</dt>
          <dd>{info.organizationName ?? 'N/A'}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-500">Date Added</dt>
          <dd>{dateAdded}</dd>
        </div>
      </dl>
    </main>
  );
}
