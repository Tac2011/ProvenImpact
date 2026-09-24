import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { COMPETENCIES } from '@/lib/competencies';
import { getUserRole } from '@/lib/roles';
import { canRequestDeletion } from '@/lib/deletionRequests';
import { ProfileForm } from './ProfileForm';

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const { count: ratedCount } = await supabase
    .from('competency_scores')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', user.id);

  const assessmentComplete = (ratedCount ?? 0) >= COMPETENCIES.length;
  const role = await getUserRole(supabase, user.id);

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold">Your Profile</h1>

      {!assessmentComplete && (
        <div className="mb-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm">
          Your evaluation is not complete.{' '}
          <Link href="/assessment" className="font-medium underline">
            Complete it now
          </Link>
        </div>
      )}

      <ProfileForm
        userId={user.id}
        initialProfile={profile}
        showDeleteAccount={canRequestDeletion(role)}
      />
    </main>
  );
}
