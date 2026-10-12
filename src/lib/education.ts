// Education pick-lists: types, labels, and formatting shared by the profile and reports.

export type DegreeType = 'AA' | 'AS' | 'AAS' | 'BA' | 'BS' | 'BFA' | 'BBA' | 'OTHER' | 'NONE';

export const DEGREE_TYPES: { value: DegreeType; label: string }[] = [
  { value: 'AA', label: 'Associate of Arts (AA)' },
  { value: 'AS', label: 'Associate of Science (AS)' },
  { value: 'AAS', label: 'Associate of Applied Science (AAS)' },
  { value: 'BA', label: 'Bachelor of Arts (BA)' },
  { value: 'BS', label: 'Bachelor of Science (BS)' },
  { value: 'BFA', label: 'Bachelor of Fine Arts (BFA)' },
  { value: 'BBA', label: 'Bachelor of Business Administration (BBA)' },
  { value: 'OTHER', label: 'Other (type it in)' },
  { value: 'NONE', label: 'No degree (previous schools only)' },
];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface College {
  id: number;
  name: string;
  city: string;
  state: string;
  nicknames: string[];
}

export interface FieldOfStudy {
  code: string;
  title: string;
}

export interface EducationRow {
  id: string;
  athlete_id: string;
  college_id: number | null;
  college_other: string | null;
  degree_type: DegreeType;
  degree_other: string | null;
  primary_field_code: string | null;
  primary_field_other: string | null;
  secondary_field_code: string | null;
  secondary_field_other: string | null;
  start_month: number;
  start_year: number;
  end_month: number;
  end_year: number;
  is_current: boolean;
}

export type EducationPayload = Omit<EducationRow, 'id' | 'athlete_id' | 'is_current'>;

// A pick from a searchable list. `other` is non-null once "not listed" is chosen.
export interface PickValue {
  id: string | null;
  other: string | null;
}

export const EMPTY_PICK: PickValue = { id: null, other: null };

export interface EducationFormValues {
  college: PickValue;
  degreeType: DegreeType | '';
  degreeOther: string;
  primaryField: PickValue;
  secondaryField: PickValue | null; // null until "Add a secondary field of study"
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
}

export function emptyEducation(): EducationFormValues {
  return {
    college: EMPTY_PICK,
    degreeType: '',
    degreeOther: '',
    primaryField: EMPTY_PICK,
    secondaryField: null,
    startMonth: null,
    startYear: null,
    endMonth: null,
    endYear: null,
  };
}

function toPick(id: string | number | null, other: string | null): PickValue {
  return { id: id === null ? null : String(id), other };
}

export function educationToForm(row: EducationRow): EducationFormValues {
  const hasSecondary = row.secondary_field_code !== null || row.secondary_field_other !== null;
  return {
    college: toPick(row.college_id, row.college_other),
    degreeType: row.degree_type,
    degreeOther: row.degree_other ?? '',
    primaryField: toPick(row.primary_field_code, row.primary_field_other),
    secondaryField: hasSecondary
      ? toPick(row.secondary_field_code, row.secondary_field_other)
      : null,
    startMonth: row.start_month,
    startYear: row.start_year,
    endMonth: row.end_month,
    endYear: row.end_year,
  };
}

function pickedId(pick: PickValue | null): string | null {
  return pick && pick.other === null ? pick.id : null;
}

function typedAnswer(pick: PickValue | null): string | null {
  return pick && pick.other !== null ? pick.other.trim() || null : null;
}

// Call only after validateEducation passes, so the degree and dates are set.
export function formToEducationPayload(values: EducationFormValues): EducationPayload {
  const collegeId = pickedId(values.college);
  return {
    college_id: collegeId === null ? null : Number(collegeId),
    college_other: typedAnswer(values.college),
    degree_type: values.degreeType as DegreeType,
    degree_other: values.degreeType === 'OTHER' ? values.degreeOther.trim() : null,
    primary_field_code: pickedId(values.primaryField),
    primary_field_other: typedAnswer(values.primaryField),
    secondary_field_code: pickedId(values.secondaryField),
    secondary_field_other: typedAnswer(values.secondaryField),
    start_month: values.startMonth as number,
    start_year: values.startYear as number,
    end_month: values.endMonth as number,
    end_year: values.endYear as number,
  };
}

// Ten years back to six ahead, plus any saved year outside that range so it still shows.
export function yearOptions(thisYear: number, saved: (number | null)[] = []): number[] {
  const years = new Set<number>();
  for (let year = thisYear - 10; year <= thisYear + 6; year++) {
    years.add(year);
  }
  for (const year of saved) {
    if (year !== null) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

export function formatMonthYear(month: number, year: number, style: 'long' | 'short' = 'long'): string {
  const name = MONTHS[month - 1] ?? '';
  return `${style === 'short' ? name.slice(0, 3) : name} ${year}`;
}

export function degreeShort(type: DegreeType, other: string | null): string {
  if (type === 'NONE') return 'No degree';
  if (type === 'OTHER') return other ?? 'Other';
  return type;
}

export function schoolName(row: EducationRow, colleges: Map<number, College>): string {
  if (row.college_id === null) return row.college_other ?? '';
  return colleges.get(row.college_id)?.name ?? 'Unknown school';
}

export function educationLine(row: EducationRow, colleges: Map<number, College>): string {
  const college = row.college_id === null ? undefined : colleges.get(row.college_id);
  const dates = `${formatMonthYear(row.start_month, row.start_year, 'short')} to ${formatMonthYear(row.end_month, row.end_year, 'short')}`;
  return [
    schoolName(row, colleges),
    college ? `${college.city}, ${college.state}` : '',
    degreeShort(row.degree_type, row.degree_other),
    dates,
  ]
    .filter(Boolean)
    .join(' · ');
}
