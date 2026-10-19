import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import {
  degreeText,
  fieldText,
  formatReportDate,
  graduationText,
  groupTopJobs,
  schoolText,
  type ReportAthlete,
  type ReportTopJobRow,
} from '@/lib/reports';
import { ExperienceList, TopJobsBlock } from '../../AthleteDetails';
import { loadExperienceReport } from '../../loadExperienceReport';

export default async function AdminAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // Same list as Reports, so this page shows exactly the athletes Reports does.
  const { data: athleteData, error: athleteError } = await supabase.rpc('admin_report_athletes');
  if (athleteError) {
    console.error('Athlete: could not load athletes', athleteError);
    return (
      <main className="mx-auto max-w-4xl p-8">
        <p className="text-red-600">Couldn&rsquo;t load this athlete. Refresh to try again.</p>
      </main>
    );
  }

  const athlete = ((athleteData ?? []) as ReportAthlete[]).find((a) => a.id === id);
  if (!athlete) {
    notFound();
  }

  const report = await loadExperienceReport(supabase, [athlete]);

  const { data: topJobData, error: topJobError } = await supabase.rpc('admin_report_top_jobs');
  if (topJobError) {
    console.error('Athlete: could not load top jobs', topJobError);
  }
  const topJobs = groupTopJobs((topJobData ?? []) as ReportTopJobRow[]).get(athlete.id);

  const facts: [string, string][] = [
    ['Email', athlete.email ?? ''],
    ['School', schoolText(athlete)],
    ['Degree', degreeText(athlete)],
    ['Field of study', fieldText(athlete)],
    ['Graduation', graduationText(athlete)],
    ['Sport', athlete.sport],
    ['Joined', formatReportDate(athlete.created_at)],
  ];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/admin/athletes" className="text-sm text-gray-600 underline">
        Back to Athletes
      </Link>
      <h1 className="mt-3 text-2xl font-bold">
        {athlete.first_name} {athlete.last_name}
      </h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd>{value || '-'}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Top jobs</h2>
        <TopJobsBlock jobs={topJobs} failed={!!topJobError} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Experiences</h2>
        {report === null ? (
          <p className="mt-2 text-sm text-red-600">Couldn&rsquo;t load experiences. Refresh to try again.</p>
        ) : (
          <ExperienceList experiences={report[0].experiences} />
        )}
      </section>
    </main>
  );
}
