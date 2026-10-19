import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import type { ReportAthlete } from '@/lib/reports';
import { AthleteSearch } from './AthleteSearch';

export default async function AdminAthletesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if ((await getUserRole(supabase, user.id)) !== 'platform_admin') {
    redirect('/profile');
  }

  const { data, error } = await supabase.rpc('admin_report_athletes');
  if (error) {
    console.error('Athletes: could not load athletes', error);
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Athletes</h1>
      {error ? (
        <p className="mt-4 text-red-600">Couldn&rsquo;t load athletes. Refresh to try again.</p>
      ) : (
        <AthleteSearch athletes={(data ?? []) as ReportAthlete[]} />
      )}
    </main>
  );
}
