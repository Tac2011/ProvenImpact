'use client';

import { useState } from 'react';
import { MonthYear } from '@/components/MonthYear';
import type { PickerOption } from '@/lib/pickerSearch';
import { formatMonthYear, yearOptions, type EducationFormValues, type EducationRow } from '@/lib/education';
import { validateTransfer, type EducationValidation } from '@/lib/validateEducation';
import { EducationFields } from './EducationFields';

export interface Transfer {
  month: number;
  year: number;
}

export function CurrentSchool({
  values,
  onChange,
  errors,
  colleges,
  fields,
  thisYear,
  saved,
  savedSchoolName,
  oldCollege,
  oldDegree,
  transfer,
  onTransferChange,
}: {
  values: EducationFormValues;
  onChange: (values: EducationFormValues) => void;
  errors: EducationValidation['errors'];
  colleges: PickerOption[];
  fields: PickerOption[];
  thisYear: number;
  saved: EducationRow | null;
  savedSchoolName: string;
  oldCollege: string | null;
  oldDegree: string | null;
  transfer: Transfer | null;
  onTransferChange: (transfer: Transfer | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [leftMonth, setLeftMonth] = useState<number | null>(null);
  const [leftYear, setLeftYear] = useState<number | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  function continueTransfer() {
    if (!saved) return;
    const error = validateTransfer(saved, leftMonth, leftYear);
    setTransferError(error);
    if (error || leftMonth === null || leftYear === null) return;
    setAsking(false);
    onTransferChange({ month: leftMonth, year: leftYear });
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Current school</h2>
        {saved && !transfer && !asking && (
          <button type="button" onClick={() => setAsking(true)} className="text-sm text-blue-700 underline">
            I transferred
          </button>
        )}
      </div>

      {asking && saved && (
        <div className="flex flex-col gap-3 rounded border border-gray-300 bg-gray-50 p-4 text-sm">
          <MonthYear
            label={`When did you leave ${savedSchoolName}?`}
            month={leftMonth}
            year={leftYear}
            years={yearOptions(thisYear, [leftYear])}
            onChange={(month, year) => {
              setLeftMonth(month);
              setLeftYear(year);
            }}
            error={transferError ?? undefined}
          />
          <div className="flex gap-2">
            <button type="button" onClick={continueTransfer} className="rounded bg-blue-700 px-4 py-2 text-white">
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false);
                setTransferError(null);
              }}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {transfer && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm">
          Moving to previous schools: {savedSchoolName} (left {formatMonthYear(transfer.month, transfer.year)}).
          Enter your new school below, then Save Profile to finish.{' '}
          <button type="button" onClick={() => onTransferChange(null)} className="underline">
            Cancel transfer
          </button>
        </div>
      )}

      {!saved && oldCollege && (
        <p className="text-sm text-gray-700">
          You entered <em>{oldCollege}</em>. Please pick your school from the list.
        </p>
      )}
      {!saved && oldDegree && (
        <p className="text-sm text-gray-700">
          You entered <em>{oldDegree}</em> for your degree. Please pick your degree and field of study from the
          lists.
        </p>
      )}

      <EducationFields
        values={values}
        onChange={onChange}
        errors={errors}
        colleges={colleges}
        fields={fields}
        isCurrent
        thisYear={thisYear}
      />
    </section>
  );
}
