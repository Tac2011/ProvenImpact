import type { EducationFormValues, EducationRow, PickValue } from './education';

export type EducationErrorKey =
  | 'college'
  | 'degreeType'
  | 'degreeOther'
  | 'primaryField'
  | 'secondaryField'
  | 'start'
  | 'end';

export interface EducationValidation {
  valid: boolean;
  errors: Partial<Record<EducationErrorKey, string>>;
}

function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function pickError(pick: PickValue, what: string): string | undefined {
  if (pick.other !== null) return pick.other.trim() ? undefined : `Type your ${what}`;
  return pick.id ? undefined : `Pick your ${what}`;
}

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function samePick(a: PickValue, b: PickValue): boolean {
  if (a.other === null && b.other === null) return a.id !== null && a.id === b.id;
  if (a.other !== null && b.other !== null) return normalized(a.other) === normalized(b.other);
  return false;
}

export function validateEducation(
  values: EducationFormValues,
  { isCurrent }: { isCurrent: boolean }
): EducationValidation {
  const errors: EducationValidation['errors'] = {};

  const college = pickError(values.college, 'school');
  if (college) errors.college = college;

  if (!values.degreeType) {
    errors.degreeType = 'Select a degree';
  } else if (values.degreeType === 'NONE' && isCurrent) {
    errors.degreeType = 'Select the degree you are working toward';
  } else if (values.degreeType === 'OTHER' && !values.degreeOther.trim()) {
    errors.degreeOther = 'Type your degree';
  }

  const primaryEmpty = values.primaryField.id === null && values.primaryField.other === null;
  if (!(values.degreeType === 'NONE' && primaryEmpty)) {
    const primary = pickError(values.primaryField, 'field of study');
    if (primary) errors.primaryField = primary;
  }

  if (values.secondaryField) {
    const secondary = pickError(values.secondaryField, 'secondary field of study');
    if (secondary) {
      errors.secondaryField = secondary;
    } else if (samePick(values.primaryField, values.secondaryField)) {
      errors.secondaryField = 'Pick a different field than your primary';
    }
  }

  const { startMonth, startYear, endMonth, endYear } = values;
  if (startMonth === null || startYear === null) {
    errors.start = 'Select the month and year you started';
  }
  if (endMonth === null || endYear === null) {
    errors.end = isCurrent
      ? 'Select your expected graduation month and year'
      : 'Select the month and year you graduated or left';
  } else if (
    startMonth !== null &&
    startYear !== null &&
    monthIndex(endYear, endMonth) < monthIndex(startYear, startMonth)
  ) {
    errors.end = isCurrent ? "Graduation can't be before you started" : "This can't be before you started";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateTransfer(
  current: EducationRow,
  month: number | null,
  year: number | null
): string | null {
  if (month === null || year === null) return 'Select the month and year you left';
  if (monthIndex(year, month) < monthIndex(current.start_year, current.start_month)) {
    return "You can't leave before you started";
  }
  return null;
}
