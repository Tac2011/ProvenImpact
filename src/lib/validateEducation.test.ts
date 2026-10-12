import { describe, expect, it } from 'vitest';
import { emptyEducation, type EducationFormValues, type EducationRow } from './education';
import { validateEducation, validateTransfer } from './validateEducation';

function values(overrides: Partial<EducationFormValues> = {}): EducationFormValues {
  return {
    ...emptyEducation(),
    college: { id: '181394', other: null },
    degreeType: 'BS',
    primaryField: { id: '11.07', other: null },
    startMonth: 8,
    startYear: 2023,
    endMonth: 5,
    endYear: 2027,
    ...overrides,
  };
}

const current = { isCurrent: true };
const previous = { isCurrent: false };

describe('validateEducation', () => {
  it('passes a complete current school', () => {
    expect(validateEducation(values(), current)).toEqual({ valid: true, errors: {} });
  });

  it('requires a school, and text when "not listed" is chosen', () => {
    expect(validateEducation(values({ college: { id: null, other: null } }), current).errors.college).toBe(
      'Pick your school'
    );
    expect(validateEducation(values({ college: { id: null, other: '   ' } }), current).errors.college).toBe(
      'Type your school'
    );
    expect(validateEducation(values({ college: { id: null, other: 'Hometown CC' } }), current).valid).toBe(true);
  });

  it('requires a degree, and text for Other', () => {
    expect(validateEducation(values({ degreeType: '' }), current).errors.degreeType).toBe('Select a degree');
    expect(
      validateEducation(values({ degreeType: 'OTHER', degreeOther: '  ' }), current).errors.degreeOther
    ).toBe('Type your degree');
  });

  it('allows No degree only on a previous school, where the field is optional', () => {
    const noDegree = values({ degreeType: 'NONE', primaryField: { id: null, other: null } });
    expect(validateEducation(noDegree, current).errors.degreeType).toBe(
      'Select the degree you are working toward'
    );
    expect(validateEducation(noDegree, previous).valid).toBe(true);
  });

  it('requires a primary field', () => {
    expect(
      validateEducation(values({ primaryField: { id: null, other: null } }), current).errors.primaryField
    ).toBe('Pick your field of study');
  });

  it('checks the secondary field only when it was added', () => {
    expect(validateEducation(values({ secondaryField: null }), current).valid).toBe(true);
    expect(
      validateEducation(values({ secondaryField: { id: null, other: null } }), current).errors.secondaryField
    ).toBe('Pick your secondary field of study');
  });

  it('rejects a secondary field that matches the primary', () => {
    expect(
      validateEducation(values({ secondaryField: { id: '11.07', other: null } }), current).errors.secondaryField
    ).toBe('Pick a different field than your primary');
    expect(
      validateEducation(
        values({ primaryField: { id: null, other: 'Esports' }, secondaryField: { id: null, other: ' esports ' } }),
        current
      ).errors.secondaryField
    ).toBe('Pick a different field than your primary');
  });

  it('requires both dates, with wording for current and previous schools', () => {
    expect(validateEducation(values({ startYear: null }), current).errors.start).toBe(
      'Select the month and year you started'
    );
    expect(validateEducation(values({ endMonth: null }), current).errors.end).toBe(
      'Select your expected graduation month and year'
    );
    expect(validateEducation(values({ endMonth: null }), previous).errors.end).toBe(
      'Select the month and year you graduated or left'
    );
  });

  it('rejects an end before the start, but allows the same month', () => {
    expect(validateEducation(values({ endYear: 2023, endMonth: 7 }), current).errors.end).toBe(
      "Graduation can't be before you started"
    );
    expect(validateEducation(values({ endYear: 2023, endMonth: 7 }), previous).errors.end).toBe(
      "This can't be before you started"
    );
    expect(validateEducation(values({ endYear: 2023, endMonth: 8 }), current).valid).toBe(true);
  });
});

describe('validateTransfer', () => {
  const saved = { start_month: 8, start_year: 2023 } as EducationRow;

  it('requires a month and year', () => {
    expect(validateTransfer(saved, null, 2025)).toBe('Select the month and year you left');
  });

  it('rejects leaving before starting', () => {
    expect(validateTransfer(saved, 7, 2023)).toBe("You can't leave before you started");
  });

  it('accepts a valid date', () => {
    expect(validateTransfer(saved, 5, 2025)).toBeNull();
  });
});
