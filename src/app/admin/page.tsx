import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = await getUserRole(supabase, user.id);

  if (role !== 'platform_admin') {
    redirect('/profile');
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">Platform Admin</h1>
      <p className="mt-4 text-gray-600">
        You&apos;re signed in as a Platform Admin. User and role management
        tools will live here.
      </p>
    </main>
  );
}
