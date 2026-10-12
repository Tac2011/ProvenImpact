'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PickerOption } from '@/lib/pickerSearch';
import {
  educationLine,
  educationToForm,
  emptyEducation,
  formToEducationPayload,
  type College,
  type EducationFormValues,
  type EducationRow,
} from '@/lib/education';
import { validateEducation, type EducationValidation } from '@/lib/validateEducation';
import { EducationFields } from './EducationFields';

export function PreviousSchools({
  athleteId,
  rows,
  collegesById,
  colleges,
  fields,
  thisYear,
}: {
  athleteId: string;
  rows: EducationRow[];
  collegesById: Map<number, College>;
  colleges: PickerOption[];
  fields: PickerOption[];
  thisYear: number;
}) {
  const router = useRouter();
  // A row id while editing that row, 'new' while adding, null otherwise.
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<EducationFormValues>(emptyEducation());
  const [errors, setErrors] = useState<EducationValidation['errors']>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  function startEditing(id: string, start: EducationFormValues) {
    setEditing(id);
    setValues(start);
    setErrors({});
    setError(null);
    setConfirmingRemove(null);
  }

  async function save() {
    const result = validateEducation(values, { isCurrent: false });
    setErrors(result.errors);
    if (!result.valid || editing === null) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = formToEducationPayload(values);
    const { error: saveError } =
      editing === 'new'
        ? await supabase.from('athlete_education').insert({ ...payload, athlete_id: athleteId, is_current: false })
        : await supabase.from('athlete_education').update(payload).eq('id', editing);
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    setSaving(true);
    setError(null);
    const { error: removeError } = await createClient().from('athlete_education').delete().eq('id', id);
    setSaving(false);

    if (removeError) {
      setError(removeError.message);
      return;
    }
    setConfirmingRemove(null);
    router.refresh();
  }

  const form = (
    <div className="flex flex-col gap-4 rounded border p-4">
      <EducationFields
        values={values}
        onChange={setValues}
        errors={errors}
        colleges={colleges}
        fields={fields}
        isCurrent={false}
        thisYear={thisYear}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save school'}
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
      <h2 className="text-lg font-semibold">Previous schools</h2>
      {rows.length === 0 && editing !== 'new' && (
        <p className="text-sm text-gray-600">No previous schools.</p>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            {editing === row.id ? (
              form
            ) : (
              <div className="flex flex-col gap-1">
                <span>{educationLine(row, collegesById)}</span>
                {confirmingRemove === row.id ? (
                  <span className="flex gap-3">
                    Remove this school?
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
                    <button
                      type="button"
                      onClick={() => startEditing(row.id, educationToForm(row))}
                      className="text-blue-700 underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(row.id)}
                      className="text-red-600 underline"
                    >
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
        <button
          type="button"
          onClick={() => startEditing('new', emptyEducation())}
          className="self-start text-sm text-blue-700 underline"
        >
          Add a previous school
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
