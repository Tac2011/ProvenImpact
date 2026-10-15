import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ExperienceAnswers, ExperienceStatus } from '@/lib/experiences';
import { requireExperiencesAccess } from '../../access';
import { ExperienceForm } from '../../ExperienceForm';

export default async function EditExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireExperiencesAccess();

  const { data } = await supabase
    .from('experiences')
    .select('title, what_you_did, frequency, result, obstacle, status')
    .eq('id', id)
    .eq('athlete_id', user.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const { status, ...answers } = data as ExperienceAnswers & { status: ExperienceStatus };
  const inProgress = status === 'in_progress';

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href={`/experiences/${id}`} className="text-sm text-gray-500 hover:underline">
        &larr; Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {inProgress ? 'Finish your experience' : 'Edit experience'}
      </h1>
      <p className="mt-2 text-gray-600">
        {inProgress
          ? 'Fill in all five answers, then we’ll show you which strengths it proves.'
          : 'Saving reads your experience again, so you’ll review and confirm the results again.'}
      </p>
      <ExperienceForm experienceId={id} initialAnswers={answers} inProgress={inProgress} />
    </main>
  );
}
