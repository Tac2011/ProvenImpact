'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateProfile, type ProfileFormValues, type SportType } from '@/lib/validateProfile';
import { validateEducation, type EducationValidation } from '@/lib/validateEducation';
import {
  educationToForm,
  emptyEducation,
  formToEducationPayload,
  schoolName,
  type College,
  type EducationFormValues,
  type EducationRow,
  type FieldOfStudy,
} from '@/lib/education';
import { collegeOptions, fieldOptions } from '@/lib/pickerSearch';
import { SPORTS, getSportType } from '@/lib/sports';
import { CurrentSchool, type Transfer } from './CurrentSchool';
import { PreviousSchools } from './PreviousSchools';
import { Honors, type HonorRow } from './Honors';
import {
  BIO_FIELD_LABELS,
  EDUCATION_BIO_FIELDS,
  bioFieldText,
  honorLine,
  mergeBio,
  takeBioValue,
  type BioField,
  type BioSchool,
  type CheckedBio,
  type FormState,
} from '@/lib/bioImport';
import { BioImport } from './BioImport';
import { applyBioImport } from './bioActions';

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  college: string | null; // old free text, shown until the athlete picks from the list
  sport: string;
  sport_type: SportType;
  degree: string | null; // old free text
  positions: string[] | null;
  disciplines: string[] | null;
}

function toFormValues(profile: ProfileRow | null): ProfileFormValues {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      sport: '',
      sportType: '',
      positions: [],
      disciplines: [],
    };
  }

  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    sport: profile.sport,
    sportType: profile.sport_type,
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
  colleges,
  fields,
  currentEducation,
  previousEducation,
  listsError,
  thisYear,
  honors,
  welcome,
}: {
  userId: string;
  initialProfile: ProfileRow | null;
  showDeleteAccount: boolean;
  colleges: College[];
  fields: FieldOfStudy[];
  currentEducation: EducationRow | null;
  previousEducation: EducationRow[];
  listsError: boolean;
  thisYear: number;
  honors: HonorRow[];
  welcome: boolean;
}) {
  const router = useRouter();
  const initialValues = toFormValues(initialProfile);
  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const [positionsText, setPositionsText] = useState(initialValues.positions.join(', '));
  const [disciplinesText, setDisciplinesText] = useState(initialValues.disciplines.join(', '));
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>['errors']>({});
  const [education, setEducation] = useState<EducationFormValues>(
    currentEducation ? educationToForm(currentEducation) : emptyEducation()
  );
  const [educationErrors, setEducationErrors] = useState<EducationValidation['errors']>({});
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The bio reading waiting for Save, what it filled, and where it disagrees with saved values.
  const [bio, setBio] = useState<{ importId: string; bio: CheckedBio } | null>(null);
  const [filled, setFilled] = useState<BioField[]>([]);
  const [differences, setDifferences] = useState<BioField[]>([]);
  const [keptHonors, setKeptHonors] = useState<boolean[]>([]);
  // Previous schools from the bio stay offered until added or skipped, even after Save.
  const [schoolSuggestions, setSchoolSuggestions] = useState<BioSchool[]>([]);

  const collegePicks = useMemo(() => collegeOptions(colleges), [colleges]);
  const fieldPicks = useMemo(() => fieldOptions(fields), [fields]);
  const collegesById = useMemo(() => new Map(colleges.map((c) => [c.id, c])), [colleges]);

  // Starting a transfer clears Current school for the new one; cancelling puts it back.
  function handleTransferChange(next: Transfer | null) {
    setTransfer(next);
    setEducation(next || !currentEducation ? emptyEducation() : educationToForm(currentEducation));
    setEducationErrors({});
  }

  // Positions and disciplines live in their text boxes until Save, so read them from there.
  function formState(): FormState {
    return {
      profile: { ...values, positions: splitTags(positionsText), disciplines: splitTags(disciplinesText) },
      education,
    };
  }

  function showFormState(next: FormState) {
    setValues(next.profile);
    setPositionsText(next.profile.positions.join(', '));
    setDisciplinesText(next.profile.disciplines.join(', '));
    setEducation(next.education);
  }

  function handleBioRead(result: { importId: string; bio: CheckedBio }) {
    const merged = mergeBio(formState(), result.bio);
    showFormState(merged);
    setFilled(merged.filled);
    setDifferences(merged.differences);
    setBio(result);
    setKeptHonors(result.bio.honors.map(() => true));
    setSchoolSuggestions(result.bio.previous);
    setSaved(false);
  }

  function takeFromBio(field: BioField) {
    if (!bio) return;
    showFormState(takeBioValue(formState(), bio.bio, field));
    setDifferences(differences.filter((f) => f !== field));
    setFilled([...filled, field]);
  }

  function fromBioTag(field: BioField) {
    return filled.includes(field) ? (
      <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">From your bio</span>
    ) : null;
  }

  function bioSaysLine(field: BioField) {
    if (!bio || !differences.includes(field)) return null;
    return (
      <span className="text-sm text-gray-600">
        Your bio says: &ldquo;{bioFieldText(bio.bio, field)}&rdquo;{' '}
        <button type="button" onClick={() => takeFromBio(field)} className="text-blue-700 underline">
          Use this
        </button>
      </span>
    );
  }

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

    if (listsError) {
      return;
    }

    const positions = splitTags(positionsText);
    const disciplines = splitTags(disciplinesText);
    const nextValues: ProfileFormValues = { ...values, positions, disciplines };

    const profileResult = validateProfile(nextValues);
    const educationResult = validateEducation(education, { isCurrent: true });
    setErrors(profileResult.errors);
    setEducationErrors(educationResult.errors);

    if (!profileResult.valid || !educationResult.valid) {
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.rpc('save_profile', {
      p: {
        first_name: nextValues.firstName,
        last_name: nextValues.lastName,
        sport: nextValues.sport,
        sport_type: nextValues.sportType,
        positions: nextValues.sportType === 'team' ? positions : null,
        disciplines: nextValues.sportType === 'individual' ? disciplines : null,
      },
      current_education: formToEducationPayload(education),
      transfer: transfer ? { end_month: transfer.month, end_year: transfer.year } : null,
    });

    if (error) {
      setSaving(false);
      setSaveError(error.message);
      return;
    }

    // The profile is saved: clear the transfer now, so retrying the bio step below can
    // never run the transfer a second time.
    setValues(nextValues);
    setTransfer(null);

    if (bio) {
      const kept = bio.bio.honors.filter((_, i) => keptHonors[i]);
      let applied: Awaited<ReturnType<typeof applyBioImport>>;
      try {
        applied = await applyBioImport(bio.importId, kept);
      } catch {
        applied = {
          ok: false,
          error: "Your profile was saved, but we couldn't add your honors and story ideas. Click Save again to retry.",
        };
      }
      if (!applied.ok) {
        setSaving(false);
        setSaveError(applied.error);
        router.refresh();
        return;
      }
      setBio(null);
      setFilled([]);
      setDifferences([]);
      setKeptHonors([]);
    }

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <>
    <BioImport welcome={welcome} onRead={handleBioRead} />
    {bio && (
      <p className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        We filled in what we found in your bio. Check everything, then click Save Profile.
      </p>
    )}
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span>First Name{fromBioTag('firstName')}</span>
        <input
          value={values.firstName}
          onChange={(e) => setValues({ ...values, firstName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {bioSaysLine('firstName')}
        {errors.firstName && <span className="text-sm text-red-600">{errors.firstName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span>Last Name{fromBioTag('lastName')}</span>
        <input
          value={values.lastName}
          onChange={(e) => setValues({ ...values, lastName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {bioSaysLine('lastName')}
        {errors.lastName && <span className="text-sm text-red-600">{errors.lastName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span>Sport{fromBioTag('sport')}</span>
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
        {bioSaysLine('sport')}
        {bio && !bio.bio.profile.sport && bio.bio.profile.sportText && !values.sport && (
          <span className="text-sm text-gray-600">
            Your bio says &ldquo;{bio.bio.profile.sportText}&rdquo;. Pick your sport.
          </span>
        )}
        {errors.sport && <span className="text-sm text-red-600">{errors.sport}</span>}
      </label>

      {values.sportType === 'team' && (
        <label className="flex flex-col gap-1">
          <span>Positions (comma-separated){fromBioTag('positions')}</span>
          <input
            value={positionsText}
            onChange={(e) => setPositionsText(e.target.value)}
            placeholder="e.g. Midfielder, Defender"
            className="rounded border px-3 py-2"
          />
          {bioSaysLine('positions')}
          {errors.positions && <span className="text-sm text-red-600">{errors.positions}</span>}
        </label>
      )}

      {values.sportType === 'individual' && (
        <label className="flex flex-col gap-1">
          <span>Disciplines (comma-separated){fromBioTag('disciplines')}</span>
          <input
            value={disciplinesText}
            onChange={(e) => setDisciplinesText(e.target.value)}
            placeholder="e.g. Long Jump, 100m Dash"
            className="rounded border px-3 py-2"
          />
          {bioSaysLine('disciplines')}
          {errors.disciplines && (
            <span className="text-sm text-red-600">{errors.disciplines}</span>
          )}
        </label>
      )}

      {listsError ? (
        <p className="border-t pt-4 text-sm text-red-600">
          We couldn&apos;t load the school and field lists. Please refresh.
        </p>
      ) : (
        <>
          {bio && (
            <div className="flex flex-col gap-1 border-t pt-4 text-sm text-gray-700">
              {EDUCATION_BIO_FIELDS.some((f) => filled.includes(f)) && (
                <span>
                  Filled from your bio:{' '}
                  {EDUCATION_BIO_FIELDS.filter((f) => filled.includes(f))
                    .map((f) => BIO_FIELD_LABELS[f])
                    .join(', ')}
                  .
                </span>
              )}
              {EDUCATION_BIO_FIELDS.filter((f) => differences.includes(f)).map((f) => (
                <span key={f}>
                  Your {BIO_FIELD_LABELS[f]}: {bioSaysLine(f)}
                </span>
              ))}
              {bio.bio.current?.collegeText && !bio.bio.current.values.college.id && !education.college.id && (
                <span>Your bio says &ldquo;{bio.bio.current.collegeText}&rdquo;. Pick your school.</span>
              )}
              {bio.bio.current?.fieldText && !bio.bio.current.values.primaryField.id && !education.primaryField.id && (
                <span>
                  Your bio says your field of study is &ldquo;{bio.bio.current.fieldText}&rdquo;. Pick it below.
                </span>
              )}
            </div>
          )}
          <CurrentSchool
          values={education}
          onChange={setEducation}
          errors={educationErrors}
          colleges={collegePicks}
          fields={fieldPicks}
          thisYear={thisYear}
          saved={currentEducation}
          savedSchoolName={currentEducation ? schoolName(currentEducation, collegesById) : ''}
          oldCollege={initialProfile?.college ?? null}
          oldDegree={initialProfile?.degree ?? null}
          transfer={transfer}
          onTransferChange={handleTransferChange}
          />
        </>
      )}

      {bio && bio.bio.honors.length > 0 && (
        <fieldset className="flex flex-col gap-2 border-t pt-4">
          <legend className="font-semibold">Honors from your bio</legend>
          <p className="text-sm text-gray-600">Checked honors are added to your profile when you save.</p>
          {bio.bio.honors.map((honor, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={keptHonors[i] ?? false}
                onChange={(e) => setKeptHonors(keptHonors.map((kept, j) => (j === i ? e.target.checked : kept)))}
                className="mt-1"
              />
              {honorLine(honor)}
            </label>
          ))}
        </fieldset>
      )}

      <button
        type="submit"
        disabled={saving || listsError}
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
      {saved && <p className="text-sm text-green-700">Profile saved.</p>}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </form>

    {currentEducation && !listsError && (
      <PreviousSchools
        athleteId={userId}
        rows={previousEducation}
        collegesById={collegesById}
        colleges={collegePicks}
        fields={fieldPicks}
        thisYear={thisYear}
      />
    )}

    <Honors athleteId={userId} rows={honors} />

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
