'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { retryExperience, type ActionResult } from '../actions';

export function RetryPanel({ experienceId, failed }: { experienceId: string; failed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);

    let result: ActionResult;
    try {
      result = await retryExperience(experienceId);
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
    <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 p-4 text-sm">
      <p>
        {failed
          ? "We couldn't read this experience just now. Your answers are saved."
          : "This experience hasn't been read yet. Your answers are saved."}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={retry}
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Reading your experience...' : 'Try again'}
        </button>
        <Link href={`/experiences/${experienceId}/edit`} className="text-gray-600 underline">
          Edit answers
        </Link>
      </div>
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
