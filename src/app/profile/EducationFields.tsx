'use client';

import { MonthYear } from '@/components/MonthYear';
import { SearchPicker } from '@/components/SearchPicker';
import type { PickerOption } from '@/lib/pickerSearch';
import {
  DEGREE_TYPES,
  EMPTY_PICK,
  yearOptions,
  type DegreeType,
  type EducationFormValues,
} from '@/lib/education';
import type { EducationValidation } from '@/lib/validateEducation';

// One school's fields, shared by Current school and Previous schools.
export function EducationFields({
  values,
  onChange,
  errors,
  colleges,
  fields,
  isCurrent,
  thisYear,
}: {
  values: EducationFormValues;
  onChange: (values: EducationFormValues) => void;
  errors: EducationValidation['errors'];
  colleges: PickerOption[];
  fields: PickerOption[];
  isCurrent: boolean;
  thisYear: number;
}) {
  const set = (patch: Partial<EducationFormValues>) => onChange({ ...values, ...patch });
  const years = yearOptions(thisYear, [values.startYear, values.endYear]);
  const degreeChoices = DEGREE_TYPES.filter((d) => !isCurrent || d.value !== 'NONE');

  return (
    <div className="flex flex-col gap-4">
      <SearchPicker
        label="School"
        options={colleges}
        value={values.college}
        onChange={(college) => set({ college })}
        notListedLabel="My school isn't listed"
        otherLabel="Your school's name"
        error={errors.college}
      />

      <label className="flex flex-col gap-1">
        Degree
        <select
          value={values.degreeType}
          onChange={(e) => set({ degreeType: e.target.value as DegreeType | '' })}
          className="rounded border px-3 py-2"
        >
          <option value="">Select a degree</option>
          {degreeChoices.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {errors.degreeType && <span className="text-sm text-red-600">{errors.degreeType}</span>}
      </label>

      {values.degreeType === 'OTHER' && (
        <label className="flex flex-col gap-1">
          Your degree
          <input
            value={values.degreeOther}
            onChange={(e) => set({ degreeOther: e.target.value })}
            placeholder="e.g. Bachelor of Science in Nursing (BSN)"
            className="rounded border px-3 py-2"
          />
          {errors.degreeOther && <span className="text-sm text-red-600">{errors.degreeOther}</span>}
        </label>
      )}

      <SearchPicker
        label={values.degreeType === 'NONE' ? 'Field of study (optional)' : 'Primary field of study'}
        options={fields}
        value={values.primaryField}
        onChange={(primaryField) => set({ primaryField })}
        notListedLabel="My field isn't listed"
        otherLabel="Your field of study"
        error={errors.primaryField}
      />

      {values.secondaryField === null ? (
        <button
          type="button"
          onClick={() => set({ secondaryField: EMPTY_PICK })}
          className="self-start text-sm text-blue-700 underline"
        >
          Add a secondary field of study
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <SearchPicker
            label="Secondary field of study"
            options={fields}
            value={values.secondaryField}
            onChange={(secondaryField) => set({ secondaryField })}
            notListedLabel="My field isn't listed"
            otherLabel="Your secondary field of study"
            error={errors.secondaryField}
          />
          <button
            type="button"
            onClick={() => set({ secondaryField: null })}
            className="self-start text-sm text-gray-600 underline"
          >
            Remove secondary field of study
          </button>
        </div>
      )}

      <MonthYear
        label="Started"
        month={values.startMonth}
        year={values.startYear}
        years={years}
        onChange={(startMonth, startYear) => set({ startMonth, startYear })}
        error={errors.start}
      />

      <MonthYear
        label={isCurrent ? 'Expected graduation' : 'Graduated or left'}
        month={values.endMonth}
        year={values.endYear}
        years={years}
        onChange={(endMonth, endYear) => set({ endMonth, endYear })}
        error={errors.end}
      />
    </div>
  );
}
