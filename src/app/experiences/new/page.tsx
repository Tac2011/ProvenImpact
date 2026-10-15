import Link from 'next/link';
import { requireExperiencesAccess } from '../access';
import { ExperienceForm } from '../ExperienceForm';

export default async function NewExperiencePage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>;
}) {
  const { supabase, user } = await requireExperiencesAccess();
  const { idea: ideaId } = await searchParams;

  // Only an open idea of this athlete's; anything else just shows the plain form.
  const { data: idea } = ideaId
    ? await supabase
        .from('story_ideas')
        .select('id, prompt')
        .eq('id', ideaId)
        .eq('athlete_id', user.id)
        .eq('status', 'open')
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/experiences" className="text-sm text-gray-500 hover:underline">
        &larr; My Experiences
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Add an experience</h1>
      <p className="mt-2 text-gray-600">
        Pick one real thing you did. Specific details, like how often, how long, and what
        changed, make your strengths easier to see.
      </p>
      {idea && (
        <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">Your story idea</p>
          <p className="mt-1 text-blue-900">{idea.prompt}</p>
        </div>
      )}
      <ExperienceForm ideaId={idea?.id} />
    </main>
  );
}
