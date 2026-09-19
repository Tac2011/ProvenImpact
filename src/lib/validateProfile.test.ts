import { describe, expect, it } from 'vitest';
import { validateProfile, type ProfileFormValues } from './validateProfile';

function baseValues(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return {
    firstName: 'Jordan',
    lastName: 'Smith',
    college: 'State University',
    sport: 'Soccer',
    sportType: 'team',
    degree: 'B.S. Kinesiology',
    positions: ['Midfielder'],
    disciplines: [],
    ...overrides,
  };
}

describe('validateProfile', () => {
  it('passes with valid team-sport values', () => {
    const result = validateProfile(baseValues());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('passes with valid individual-sport values', () => {
    const result = validateProfile(
      baseValues({ sportType: 'individual', positions: [], disciplines: ['Long Jump'] })
    );
    expect(result.valid).toBe(true);
  });

  it('requires first name', () => {
    const result = validateProfile(baseValues({ firstName: '  ' }));
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBeDefined();
  });

  it('requires a sport type to be selected', () => {
    const result = validateProfile(baseValues({ sportType: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.sportType).toBeDefined();
  });

  it('requires at least one position when sport type is team', () => {
    const result = validateProfile(baseValues({ positions: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.positions).toBeDefined();
  });

  it('requires at least one discipline when sport type is individual', () => {
    const result = validateProfile(
      baseValues({ sportType: 'individual', positions: [], disciplines: [] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.disciplines).toBeDefined();
  });
});
