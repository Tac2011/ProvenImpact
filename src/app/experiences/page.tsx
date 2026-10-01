import Link from 'next/link';
import { competencyLabel } from '@/lib/rubric';
import { STATUS_LABELS, type ExperienceStatus } from '@/lib/experiences';
import { requireExperiencesAccess } from './access';

interface ListRow {
  id: string;
  title: string;
  status: ExperienceStatus;
  experience_evidence: { competency_key: string; included: boolean }[];
}

export default async function ExperiencesPage() {
  const { supabase, user, rubric } = await requireExperiencesAccess();

  const { data } = await supabase
    .from('experiences')
    .select('id, title, status, experience_evidence(competency_key, included)')
    .eq('athlete_id', user.id)
    .order('created_at', { ascending: false });

  const experiences = (data ?? []) as ListRow[];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">My Experiences</h1>
        <Link
          href="/experiences/new"
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Add experience
        </Link>
      </div>
      <p className="mt-2 text-gray-600">
        Describe something real you did, like a training routine, a comeback, or learning
        something hard. We&apos;ll show you which strengths it proves, in your own words.
      </p>

      {experiences.length === 0 ? (
        <p className="mt-8 text-sm text-gray-600">No experiences yet. Add your first one to get started.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {experiences.map((experience) => {
            const found = experience.experience_evidence
              .filter((item) => item.included)
              .map((item) => competencyLabel(item.competency_key, rubric.competencies));
            return (
              <li key={experience.id}>
                <Link
                  href={`/experiences/${experience.id}`}
                  className="block rounded border p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium">{experience.title}</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {STATUS_LABELS[experience.status]}
                    </span>
                  </div>
                  {found.length > 0 && <p className="mt-1 text-sm text-gray-600">{found.join(', ')}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
