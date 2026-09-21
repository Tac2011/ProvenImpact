'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { COMPETENCIES, COMPETENCY_CATEGORIES } from '@/lib/competencies';

export function AssessmentForm({
  userId,
  initialScores,
}: {
  userId: string;
  initialScores: Record<string, number>;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const ratedCount = Object.keys(scores).length;
  const totalCount = COMPETENCIES.length;

  async function handleRate(competencyKey: string, category: string, value: number) {
    const nextScores = { ...scores, [competencyKey]: value };
    setScores(nextScores);
    setSavingKey(competencyKey);

    const supabase = createClient();
    await supabase.from('competency_scores').upsert({
      athlete_id: userId,
      competency_key: competencyKey,
      category,
      score: value,
      updated_at: new Date().toISOString(),
    });

    setSavingKey(null);

    if (Object.keys(nextScores).length === COMPETENCIES.length) {
      setTimeout(() => {
        router.push('/profile');
        router.refresh();
      }, 400);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <p className="text-sm font-medium text-gray-700">
        Progress: {ratedCount} of {totalCount} rated
      </p>

      {COMPETENCY_CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <h2 className="text-lg font-semibold">{cat.label}</h2>
          <p className="text-sm text-gray-500">
            1 = Rarely &nbsp;&nbsp; 3 = Sometimes &nbsp;&nbsp; 5 = Always
          </p>

          <div className="mt-4 flex flex-col gap-4">
            {COMPETENCIES.filter((c) => c.category === cat.key).map((c) => (
              <div key={c.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">{c.label}</span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleRate(c.key, cat.key, value)}
                      aria-pressed={scores[c.key] === value}
                      className={`h-9 w-9 rounded border text-sm font-medium ${
                        scores[c.key] === value
                          ? 'border-blue-700 bg-blue-700 text-white'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                  {savingKey === c.key && (
                    <span className="text-xs text-gray-400">Saving...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
