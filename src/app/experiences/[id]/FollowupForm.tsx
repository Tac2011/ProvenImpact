'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANSWER_MAX_LENGTH } from '@/lib/experiences';
import { submitFollowups, type ActionResult } from '../actions';

export function FollowupForm({
  experienceId,
  questions,
}: {
  experienceId: string;
  questions: string[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip sends every answer as blank; blank answers are saved as skipped.
  async function send(skip: boolean) {
    setBusy(true);
    setError(null);

    let result: ActionResult;
    try {
      result = await submitFollowups(experienceId, skip ? questions.map(() => null) : answers);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-gray-600">
        A couple of quick questions will help us see your strengths more clearly. Answer what
        you can, or skip.
      </p>

      {questions.map((question, i) => (
        <div key={question} className="flex flex-col gap-1">
          <label htmlFor={`followup-${i}`} className="font-medium">
            {question}
          </label>
          <textarea
            id={`followup-${i}`}
            rows={3}
            value={answers[i]}
            maxLength={ANSWER_MAX_LENGTH}
            disabled={busy}
            onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
            className="rounded border border-gray-300 p-2 text-sm disabled:bg-gray-50"
          />
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => send(false)}
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Reading your experience...' : 'Continue'}
        </button>
        <button
          type="button"
          onClick={() => send(true)}
          disabled={busy}
          className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
