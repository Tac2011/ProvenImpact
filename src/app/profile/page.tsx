import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { COMPETENCIES } from '@/lib/competencies';
import { getUserRole } from '@/lib/roles';
import { canRequestDeletion } from '@/lib/deletionRequests';
import type { College, EducationRow, FieldOfStudy } from '@/lib/education';
import { ProfileForm } from './ProfileForm';
import type { HonorRow } from './Honors';

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

  const [collegesResult, fieldsResult, educationResult, honorsResult] = await Promise.all([
    supabase.from('colleges').select('id, name, city, state, nicknames').order('name'),
    supabase.from('fields_of_study').select('code, title').order('title'),
    supabase
      .from('athlete_education')
      .select('*')
      .eq('athlete_id', user.id)
      .order('end_year', { ascending: false })
      .order('end_month', { ascending: false }),
    supabase
      .from('athlete_honors')
      .select('id, title, years')
      .eq('athlete_id', user.id)
      .order('created_at'),
  ]);

  const loadError = collegesResult.error ?? fieldsResult.error ?? educationResult.error;
  if (loadError) {
    console.error('Profile: could not load education data', loadError);
  }

  const educationRows = (educationResult.data ?? []) as EducationRow[];
  // Central time, so the year menus roll over at local midnight on New Year's.
  const thisYear = Number(
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Chicago' }).format(new Date())
  );

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
        colleges={(collegesResult.data ?? []) as College[]}
        fields={(fieldsResult.data ?? []) as FieldOfStudy[]}
        currentEducation={educationRows.find((r) => r.is_current) ?? null}
        previousEducation={educationRows.filter((r) => !r.is_current)}
        listsError={loadError !== null}
        thisYear={thisYear}
        honors={(honorsResult.data ?? []) as HonorRow[]}
        welcome={profile === null}
      />
    </main>
  );
}
