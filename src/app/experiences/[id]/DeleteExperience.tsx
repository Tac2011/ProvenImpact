'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function DeleteExperience({ experienceId }: { experienceId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    // A delete blocked by a security rule returns no error, just no rows, so ask for
    // the deleted row back and treat an empty result as a failure.
    const { data, error } = await supabase
      .from('experiences')
      .delete()
      .eq('id', experienceId)
      .select('id');

    if (error || !data || data.length === 0) {
      setBusy(false);
      setError('Could not delete this experience. Please try again.');
      return;
    }

    router.push('/experiences');
    router.refresh();
  }

  return (
    <div className="mt-12 border-t pt-4 text-sm">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-red-700">Delete this experience? This can&apos;t be undone.</span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
          >
            {busy ? 'Deleting...' : 'Yes, delete'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-gray-500 hover:text-red-600 hover:underline"
        >
          Delete experience
        </button>
      )}
      {error && <p className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
