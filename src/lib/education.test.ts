import { describe, expect, it } from 'vitest';
import {
  degreeShort,
  educationLine,
  educationToForm,
  emptyEducation,
  formatMonthYear,
  formToEducationPayload,
  schoolName,
  yearOptions,
  type College,
  type EducationFormValues,
  type EducationRow,
} from './education';

const IOWA_WESTERN: College = {
  id: 153630,
  name: 'Iowa Western Community College',
  city: 'Council Bluffs',
  state: 'IA',
  nicknames: [],
};
const colleges = new Map([[IOWA_WESTERN.id, IOWA_WESTERN]]);

function row(overrides: Partial<EducationRow> = {}): EducationRow {
  return {
    id: 'e1',
    athlete_id: 'a1',
    college_id: 153630,
    college_other: null,
    degree_type: 'AA',
    degree_other: null,
    primary_field_code: '24.01',
    primary_field_other: null,
    secondary_field_code: null,
    secondary_field_other: null,
    start_month: 8,
    start_year: 2023,
    end_month: 5,
    end_year: 2025,
    is_current: false,
    ...overrides,
  };
}

describe('yearOptions', () => {
  it('runs from ten years back to six ahead, oldest first', () => {
    const years = yearOptions(2026);
    expect(years[0]).toBe(2016);
    expect(years[years.length - 1]).toBe(2032);
    expect(years).toHaveLength(17);
  });

  it('keeps a saved year outside the range so it still shows', () => {
    expect(yearOptions(2026, [2012, null])[0]).toBe(2012);
    expect(yearOptions(2026, [2012]).filter((y) => y === 2012)).toHaveLength(1);
  });
});

describe('formatMonthYear', () => {
  it('formats long and short', () => {
    expect(formatMonthYear(5, 2027)).toBe('May 2027');
    expect(formatMonthYear(8, 2023, 'short')).toBe('Aug 2023');
  });
});

describe('degreeShort', () => {
  it('uses the code, the typed text for Other, and words for No degree', () => {
    expect(degreeShort('BS', null)).toBe('BS');
    expect(degreeShort('OTHER', 'BSN')).toBe('BSN');
    expect(degreeShort('NONE', null)).toBe('No degree');
  });
});

describe('schoolName and educationLine', () => {
  it('describes a listed school with city, degree, and dates', () => {
    expect(educationLine(row(), colleges)).toBe(
      'Iowa Western Community College · Council Bluffs, IA · AA · Aug 2023 to May 2025'
    );
  });

  it('uses the typed name for a school that is not listed', () => {
    const typed = row({ college_id: null, college_other: 'Hometown CC' });
    expect(schoolName(typed, colleges)).toBe('Hometown CC');
    expect(educationLine(typed, colleges)).toBe('Hometown CC · AA · Aug 2023 to May 2025');
  });
});

describe('educationToForm and formToEducationPayload', () => {
  it('round-trips a row', () => {
    const original = row({ secondary_field_other: 'Coaching' });
    const payload = formToEducationPayload(educationToForm(original));
    // Every payload value matches the row, and the payload has all 12 editable columns.
    expect({ ...original, ...payload }).toEqual(original);
    expect(Object.keys(payload)).toHaveLength(12);
  });

  it('hides the secondary field when the row has none', () => {
    expect(educationToForm(row()).secondaryField).toBeNull();
  });

  it('trims typed answers and drops degree text unless the degree is Other', () => {
    const values: EducationFormValues = {
      ...emptyEducation(),
      college: { id: null, other: '  Hometown CC  ' },
      degreeType: 'BS',
      degreeOther: 'leftover',
      primaryField: { id: '11.07', other: null },
      startMonth: 8,
      startYear: 2023,
      endMonth: 5,
      endYear: 2027,
    };
    const payload = formToEducationPayload(values);
    expect(payload.college_other).toBe('Hometown CC');
    expect(payload.college_id).toBeNull();
    expect(payload.degree_other).toBeNull();
    expect(payload.secondary_field_code).toBeNull();
    expect(payload.secondary_field_other).toBeNull();
  });

  it('turns a picked school id back into a number', () => {
    const values: EducationFormValues = {
      ...emptyEducation(),
      college: { id: '181394', other: null },
      degreeType: 'BS',
      primaryField: { id: '11.07', other: null },
      startMonth: 8,
      startYear: 2023,
      endMonth: 5,
      endYear: 2027,
    };
    expect(formToEducationPayload(values).college_id).toBe(181394);
  });
});
