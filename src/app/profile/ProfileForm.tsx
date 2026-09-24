'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateProfile, type ProfileFormValues, type SportType } from '@/lib/validateProfile';
import { SPORTS, getSportType } from '@/lib/sports';

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  college: string;
  sport: string;
  sport_type: SportType;
  degree: string;
  positions: string[] | null;
  disciplines: string[] | null;
}

function toFormValues(profile: ProfileRow | null): ProfileFormValues {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      college: '',
      sport: '',
      sportType: '',
      degree: '',
      positions: [],
      disciplines: [],
    };
  }

  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    college: profile.college,
    sport: profile.sport,
    sportType: profile.sport_type,
    degree: profile.degree,
    positions: profile.positions ?? [],
    disciplines: profile.disciplines ?? [],
  };
}

function splitTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ProfileForm({
  userId,
  initialProfile,
  showDeleteAccount,
}: {
  userId: string;
  initialProfile: ProfileRow | null;
  showDeleteAccount: boolean;
}) {
  const router = useRouter();
  const initialValues = toFormValues(initialProfile);
  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const [positionsText, setPositionsText] = useState(initialValues.positions.join(', '));
  const [disciplinesText, setDisciplinesText] = useState(initialValues.disciplines.join(', '));
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>['errors']>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setDeleting(false);
      setDeleteError('Could not confirm your account. Please log in again.');
      return;
    }

    const { error } = await supabase
      .from('deletion_requests')
      .insert({ user_id: userId, email: user.email });

    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }

    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setSaveError(null);

    const positions = splitTags(positionsText);
    const disciplines = splitTags(disciplinesText);
    const nextValues: ProfileFormValues = { ...values, positions, disciplines };

    const result = validateProfile(nextValues);
    setErrors(result.errors);

    if (!result.valid) {
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      first_name: nextValues.firstName,
      last_name: nextValues.lastName,
      college: nextValues.college,
      sport: nextValues.sport,
      sport_type: nextValues.sportType,
      degree: nextValues.degree,
      positions: nextValues.sportType === 'team' ? positions : null,
      disciplines: nextValues.sportType === 'individual' ? disciplines : null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setValues(nextValues);
    setSaved(true);
    router.refresh();
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        First Name
        <input
          value={values.firstName}
          onChange={(e) => setValues({ ...values, firstName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.firstName && <span className="text-sm text-red-600">{errors.firstName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Last Name
        <input
          value={values.lastName}
          onChange={(e) => setValues({ ...values, lastName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.lastName && <span className="text-sm text-red-600">{errors.lastName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        College
        <input
          value={values.college}
          onChange={(e) => setValues({ ...values, college: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.college && <span className="text-sm text-red-600">{errors.college}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Degree
        <input
          value={values.degree}
          onChange={(e) => setValues({ ...values, degree: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.degree && <span className="text-sm text-red-600">{errors.degree}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Sport
        <select
          value={values.sport}
          onChange={(e) => {
            const sport = e.target.value;
            setValues({ ...values, sport, sportType: getSportType(sport) });
          }}
          className="rounded border px-3 py-2"
        >
          <option value="">Select a sport</option>
          {SPORTS.map((sport) => (
            <option key={sport.name} value={sport.name}>
              {sport.name}
            </option>
          ))}
        </select>
        {errors.sport && <span className="text-sm text-red-600">{errors.sport}</span>}
      </label>

      {values.sportType === 'team' && (
        <label className="flex flex-col gap-1">
          Positions (comma-separated)
          <input
            value={positionsText}
            onChange={(e) => setPositionsText(e.target.value)}
            placeholder="e.g. Midfielder, Defender"
            className="rounded border px-3 py-2"
          />
          {errors.positions && <span className="text-sm text-red-600">{errors.positions}</span>}
        </label>
      )}

      {values.sportType === 'individual' && (
        <label className="flex flex-col gap-1">
          Disciplines (comma-separated)
          <input
            value={disciplinesText}
            onChange={(e) => setDisciplinesText(e.target.value)}
            placeholder="e.g. Long Jump, 100m Dash"
            className="rounded border px-3 py-2"
          />
          {errors.disciplines && (
            <span className="text-sm text-red-600">{errors.disciplines}</span>
          )}
        </label>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
      {saved && <p className="text-sm text-green-700">Profile saved.</p>}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </form>

    {showDeleteAccount && (
      <DeleteAccountSection
        confirmingDelete={confirmingDelete}
        setConfirmingDelete={setConfirmingDelete}
        deleting={deleting}
        deleteError={deleteError}
        onDelete={handleDelete}
      />
    )}
    </>
  );
}

function DeleteAccountSection({
  confirmingDelete,
  setConfirmingDelete,
  deleting,
  deleteError,
  onDelete,
}: {
  confirmingDelete: boolean;
  setConfirmingDelete: (value: boolean) => void;
  deleting: boolean;
  deleteError: string | null;
  onDelete: () => void;
}) {
  return (
    <div className="mt-10 border-t pt-6">
      <h2 className="text-sm font-semibold text-gray-700">Danger Zone</h2>

      {!confirmingDelete ? (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="mt-2 text-sm text-red-600 underline"
        >
          Request Account Deletion
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-3 rounded border border-red-300 bg-red-50 p-4 text-sm">
          <p>
            Are you sure? An Admin will process your request. You&apos;ll be
            signed out right away and won&apos;t be able to log back in unless
            an Admin restores your account.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {deleting ? 'Submitting...' : 'Yes, request deletion'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          {deleteError && <p className="text-red-600">{deleteError}</p>}
        </div>
      )}
    </div>
  );
}
