import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOpenDeletionStatus, isLockedOut } from '@/lib/deletionRequests';

export default async function AccountLockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const status = await getOpenDeletionStatus(supabase, user.id);

  if (!isLockedOut(status)) {
    redirect('/profile');
  }

  const approved = status === 'approved';

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold">
        {approved ? 'Account Deleted' : 'Deletion Requested'}
      </h1>
      <p className="text-gray-600">
        {approved
          ? 'This account has been deleted.'
          : 'Your account deletion request is being processed.'}{' '}
        If this was a mistake, contact support to have your account restored.
      </p>
    </main>
  );
}
