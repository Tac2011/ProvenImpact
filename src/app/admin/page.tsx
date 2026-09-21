import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRoleInfo, type UserRole } from '@/lib/roles';

const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: 'Main Admin',
  corporate_admin: 'Corporate Admin',
  corporate_user: 'Corporate User',
  university_admin: 'University Admin',
  university_user: 'University User',
  student_athlete: 'Student Athlete',
};

export default async function AdminPage() {
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

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">Platform Admin</h1>

      <dl className="mt-6 flex flex-col gap-4 text-sm">
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

      <p className="mt-8 text-gray-600">
        User and role management tools will live here.
      </p>
    </main>
  );
}
