'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { HONOR_TITLE_MAX, HONOR_YEARS_MAX, honorLine } from '@/lib/bioImport';

export interface HonorRow {
  id: string;
  title: string;
  years: string | null;
}

// Add, edit, and remove save right away, like Previous schools.
export function Honors({ athleteId, rows }: { athleteId: string; rows: HonorRow[] }) {
  const router = useRouter();
  // A row id while editing that row, 'new' while adding, null otherwise.
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [years, setYears] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  function startEditing(id: string, row?: HonorRow) {
    setEditing(id);
    setTitle(row?.title ?? '');
    setYears(row?.years ?? '');
    setError(null);
    setConfirmingRemove(null);
  }

  async function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Title is required.');
      return;
    }
    if (editing === null) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = { title: cleanTitle, years: years.trim() || null };
    // A write blocked by a security rule returns no error, just no rows, so ask for the row back.
    const { data, error: saveError } =
      editing === 'new'
        ? await supabase.from('athlete_honors').insert({ ...payload, athlete_id: athleteId, source: 'manual' }).select('id')
        : await supabase.from('athlete_honors').update(payload).eq('id', editing).select('id');
    setSaving(false);

    if (saveError || !data || data.length === 0) {
      setError('Could not save that honor. Please try again.');
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    setSaving(true);
    setError(null);
    const { data, error: removeError } = await createClient().from('athlete_honors').delete().eq('id', id).select('id');
    setSaving(false);

    if (removeError || !data || data.length === 0) {
      setError('Could not remove that honor. Please try again.');
      return;
    }
    setConfirmingRemove(null);
    router.refresh();
  }

  const form = (
    <div className="flex flex-col gap-3 rounded border p-4">
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          value={title}
          maxLength={HONOR_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Academic All-Big Ten"
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Years (optional)
        <input
          value={years}
          maxLength={HONOR_YEARS_MAX}
          onChange={(e) => setYears(e.target.value)}
          placeholder="e.g. 2024, 2025"
          className="rounded border px-3 py-2"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save honor'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <section className="mt-10 flex flex-col gap-3 border-t pt-6">
      <h2 className="text-lg font-semibold">Honors and awards</h2>
      {rows.length === 0 && editing !== 'new' && <p className="text-sm text-gray-600">No honors yet.</p>}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            {editing === row.id ? (
              form
            ) : (
              <div className="flex flex-col gap-1">
                <span>{honorLine({ title: row.title, years: row.years ?? '' })}</span>
                {confirmingRemove === row.id ? (
                  <span className="flex gap-3">
                    Remove this honor?
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      disabled={saving}
                      className="text-red-600 underline"
                    >
                      Yes, remove
                    </button>
                    <button type="button" onClick={() => setConfirmingRemove(null)} className="underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex gap-3">
                    <button type="button" onClick={() => startEditing(row.id, row)} className="text-blue-700 underline">
                      Edit
                    </button>
                    <button type="button" onClick={() => setConfirmingRemove(row.id)} className="text-red-600 underline">
                      Remove
                    </button>
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        form
      ) : (
        <button type="button" onClick={() => startEditing('new')} className="self-start text-sm text-blue-700 underline">
          Add an honor
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
