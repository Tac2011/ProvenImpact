import type { AthleteTopJobs, ReportExperience } from '@/lib/reports';

// Shared by the Reports cards and the athlete page.

export function ExperienceList({ experiences }: { experiences: ReportExperience[] }) {
  if (experiences.length === 0) {
    return <p className="mt-2 text-sm text-gray-600">No experiences yet.</p>;
  }
  return (
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
            {e.strengths.length > 0 ? `Strengths: ${e.strengths.join(', ')}` : 'Strengths: none kept.'}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TopJobsBlock({ jobs, failed }: { jobs: AthleteTopJobs | undefined; failed: boolean }) {
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
