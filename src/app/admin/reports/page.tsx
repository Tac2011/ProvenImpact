import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import {
  athleteSummary,
  buildExperienceReport,
  degreeText,
  fieldText,
  formatReportDate,
  graduationText,
  groupNotListed,
  groupTopJobs,
  mostSuggestedJobs,
  REPORTED_STATUSES,
  schoolText,
  type AthleteExperiences,
  type AthleteTopJobs,
  type NotListedRow,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
  type ReportTopJobRow,
} from '@/lib/reports';

export default async function AdminReportsPage() {
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

  const { data: athleteData, error: athleteError } = await supabase.rpc('admin_report_athletes');

  if (athleteError) {
    console.error('Reports: could not load athletes', athleteError);
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-4 text-red-600">Couldn&rsquo;t load reports. Refresh to try again.</p>
      </main>
    );
  }

  const athletes = (athleteData ?? []) as ReportAthlete[];
  const report = await loadExperienceReport(supabase, athletes);

  const { data: topJobData, error: topJobError } = await supabase.rpc('admin_report_top_jobs');
  if (topJobError) {
    console.error('Reports: could not load top jobs', topJobError);
  }
  const topJobRows = (topJobData ?? []) as ReportTopJobRow[];
  const topJobs = groupTopJobs(topJobRows);
  const suggested = mostSuggestedJobs(topJobRows, athletes);

  const { data: notListedData, error: notListedError } = await supabase.rpc('admin_report_not_listed');
  if (notListedError) {
    console.error('Reports: could not load not listed answers', notListedError);
  }
  const notListed = groupNotListed((notListedData ?? []) as NotListedRow[]);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Reports</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Student Athletes ({athletes.length})</h2>
        {athletes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No student athletes yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2 font-medium">School</th>
                  <th scope="col" className="px-3 py-2 font-medium">Degree</th>
                  <th scope="col" className="px-3 py-2 font-medium">Field of study</th>
                  <th scope="col" className="px-3 py-2 font-medium">Graduation</th>
                  <th scope="col" className="px-3 py-2 font-medium">Sport</th>
                  <th scope="col" className="px-3 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.last_name}, {a.first_name}
                    </td>
                    <td className="px-3 py-2">{schoolText(a)}</td>
                    <td className="px-3 py-2">{degreeText(a)}</td>
                    <td className="px-3 py-2">{fieldText(a)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{graduationText(a)}</td>
                    <td className="px-3 py-2">{a.sport}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatReportDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {athletes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Student Athlete Experience Report</h2>
          {report === null ? (
            <p className="mt-3 text-sm text-red-600">
              Couldn&rsquo;t load the experience report. Refresh to try again.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {report.map(({ athlete, experiences }) => (
                <div key={athlete.id} className="rounded border bg-white p-4">
                  <div>
                    <span className="font-semibold">
                      {athlete.first_name} {athlete.last_name}
                    </span>
                    <span className="text-sm text-gray-500"> · {athleteSummary(athlete)}</span>
                  </div>
                  {experiences.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">No experiences yet.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-3 text-sm">
                      {experiences.map((e) => (
                        <li key={e.id}>
                          <div>
                            <span className="font-medium">{e.title}</span>
                            <span className="text-gray-500">
                              , {e.statusLabel}, {e.date}
                            </span>
                          </div>
                          <div className="text-gray-700">
                            {e.strengths.length > 0
                              ? `Strengths: ${e.strengths.join(', ')}`
                              : 'Strengths: none kept.'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <TopJobsBlock jobs={topJobs.get(athlete.id)} failed={!!topJobError} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {athletes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Most suggested jobs</h2>
          <p className="mt-1 text-sm text-gray-600">How many athletes have each job in their latest top 10.</p>
          {topJobError ? (
            <p className="mt-3 text-sm text-red-600">Couldn&rsquo;t load top jobs. Refresh to try again.</p>
          ) : suggested.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No athlete has generated top jobs yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Job</th>
                    <th scope="col" className="px-3 py-2 font-medium">Athletes</th>
                    <th scope="col" className="px-3 py-2 font-medium">Who</th>
                  </tr>
                </thead>
                <tbody>
                  {suggested.map((j) => (
                    <tr key={j.code} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{j.title}</td>
                      <td className="px-3 py-2">{j.athletes.length}</td>
                      <td className="px-3 py-2">{j.athletes.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">&ldquo;Not listed&rdquo; answers</h2>
        {notListedError ? (
          <p className="mt-3 text-sm text-red-600">
            Couldn&rsquo;t load the &ldquo;not listed&rdquo; answers. Refresh to try again.
          </p>
        ) : notListed.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">Every athlete picked from the lists.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2 font-medium">Answer</th>
                  <th scope="col" className="px-3 py-2 font-medium">Athletes</th>
                  <th scope="col" className="px-3 py-2 font-medium">Who</th>
                </tr>
              </thead>
              <tbody>
                {notListed.map((g) => (
                  <tr key={`${g.kind}|${g.answer}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap">{g.kind}</td>
                    <td className="px-3 py-2">{g.answer}</td>
                    <td className="px-3 py-2">{g.athletes.length}</td>
                    <td className="px-3 py-2">{g.athletes.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function TopJobsBlock({ jobs, failed }: { jobs: AthleteTopJobs | undefined; failed: boolean }) {
  if (failed) {
    return <p className="mt-3 text-sm text-red-600">Couldn&rsquo;t load top jobs.</p>;
  }
  if (!jobs) {
    return <p className="mt-3 text-sm text-gray-600">No top jobs yet.</p>;
  }
  return (
    <div className="mt-3 text-sm">
      <div className="font-medium">Top jobs ({jobs.date})</div>
      <ol className="mt-1 flex flex-col gap-0.5 text-gray-700">
        {jobs.jobs.map((j) => (
          <li key={j.rank}>
            {j.rank}. {j.title}, {j.level}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Returns null when the experiences can't be loaded, so the page can say so.
async function loadExperienceReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athletes: ReportAthlete[]
): Promise<AthleteExperiences[] | null> {
  if (athletes.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('experiences')
    .select(
      'id, athlete_id, title, status, created_at, rubric_version_id, experience_evidence(competency_key, strength, included)'
    )
    .in(
      'athlete_id',
      athletes.map((a) => a.id)
    )
    .in('status', REPORTED_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Reports: could not load experiences', error);
    return null;
  }

  const experiences = (data ?? []) as ReportExperienceRow[];
  const versionIds = [
    ...new Set(experiences.map((e) => e.rubric_version_id).filter((id) => id !== null)),
  ];

  // If labels fail to load, competencyLabel falls back to the title-cased key.
  const { data: labelData, error: labelError } =
    versionIds.length > 0
      ? await supabase
          .from('rubric_competencies')
          .select('rubric_version_id, key, label')
          .in('rubric_version_id', versionIds)
      : { data: [], error: null };

  if (labelError) {
    console.error('Reports: could not load competency labels', labelError);
  }

  return buildExperienceReport(athletes, experiences, (labelData ?? []) as ReportLabel[]);
}
