import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AssessmentForm } from './AssessmentForm';

export default async function AssessmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: scores } = await supabase
    .from('competency_scores')
    .select('competency_key, score')
    .eq('athlete_id', user.id);

  const initialScores: Record<string, number> = {};
  for (const row of scores ?? []) {
    initialScores[row.competency_key] = row.score;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Self-Assessment</h1>
      <p className="mt-2 text-gray-600">
        Rate yourself from 1 to 5 on each competency below. Your answers save
        automatically as you go, so it&apos;s safe to leave and come back
        anytime.
      </p>

      <AssessmentForm userId={user.id} initialScores={initialScores} />
    </main>
  );
}
