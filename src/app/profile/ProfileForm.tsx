'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateProfile, type ProfileFormValues, type SportType } from '@/lib/validateProfile';

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
}: {
  userId: string;
  initialProfile: ProfileRow | null;
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
        <input
          value={values.sport}
          onChange={(e) => setValues({ ...values, sport: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.sport && <span className="text-sm text-red-600">{errors.sport}</span>}
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend>Sport Type</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sportType"
            checked={values.sportType === 'team'}
            onChange={() => setValues({ ...values, sportType: 'team' })}
          />
          Team
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sportType"
            checked={values.sportType === 'individual'}
            onChange={() => setValues({ ...values, sportType: 'individual' })}
          />
          Individual
        </label>
        {errors.sportType && <span className="text-sm text-red-600">{errors.sportType}</span>}
      </fieldset>

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
  );
}
