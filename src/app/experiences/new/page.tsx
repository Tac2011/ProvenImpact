import Link from 'next/link';
import { requireExperiencesAccess } from '../access';
import { ExperienceForm } from '../ExperienceForm';

export default async function NewExperiencePage() {
  await requireExperiencesAccess();

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
      <ExperienceForm />
    </main>
  );
}
