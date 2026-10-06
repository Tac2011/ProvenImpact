import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ExperienceAnswers } from '@/lib/experiences';
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
    .select('title, what_you_did, frequency, result, obstacle')
    .eq('id', id)
    .eq('athlete_id', user.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const answers = data as ExperienceAnswers;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href={`/experiences/${id}`} className="text-sm text-gray-500 hover:underline">
        &larr; Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Edit experience</h1>
      <p className="mt-2 text-gray-600">
        Saving reads your experience again, so you&apos;ll review and confirm the results again.
      </p>
      <ExperienceForm experienceId={id} initialAnswers={answers} />
    </main>
  );
}
