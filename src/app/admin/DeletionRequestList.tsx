'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PendingDeletionRow } from '@/lib/deletionRequests';

export function DeletionRequestList({
  adminId,
  rows,
}: {
  adminId: string;
  rows: PendingDeletionRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, status: 'approved' | 'restored') {
    setBusyId(id);
    setError(null);

    const supabase = createClient();
    // Filtering on pending means a second Admin acting on the same request changes nothing.
    const { error } = await supabase
      .from('deletion_requests')
      .update({ status, resolved_by: adminId, resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending');

    setBusyId(null);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded border p-3 text-sm"
          >
            <div>
              <div className="font-medium">{row.displayName}</div>
              <div className="text-gray-500">
                Requested {new Date(row.requestedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => resolve(row.id, 'approved')}
                disabled={busyId !== null}
                className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => resolve(row.id, 'restored')}
                disabled={busyId !== null}
                className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
              >
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
