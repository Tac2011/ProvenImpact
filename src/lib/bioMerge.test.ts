import { describe, expect, it } from 'vitest';
import { bioFieldText, checkBioOutput, mergeBio, takeBioValue, type CheckedBio, type FormState } from './bioImport';
import { caleOutput, ctx } from './__fixtures__/bioOutput';
import { emptyEducation } from './education';

function caleBio(): CheckedBio {
  const result = checkBioOutput(caleOutput(), ctx);
  if (!result.ok) throw new Error('expected ok');
  return result.bio;
}

const blank: FormState = {
  profile: { firstName: '', lastName: '', sport: '', sportType: '', positions: [], disciplines: [] },
  education: emptyEducation(),
};

describe('mergeBio', () => {
  it('fills every empty field the bio covers', () => {
    const merged = mergeBio(blank, caleBio());
    expect(merged.profile).toEqual({
      firstName: 'Cale',
      lastName: 'Jacobsen',
      sport: 'Basketball',
      sportType: 'team',
      positions: ['Guard'],
      disciplines: [],
    });
    expect(merged.education.college).toEqual({ id: '1', other: null });
    expect(merged.education.degreeType).toBe('OTHER');
    expect(merged.filled).toEqual(['firstName', 'lastName', 'sport', 'positions', 'college', 'degree']);
    expect(merged.differences).toEqual([]);
  });

  it('never overwrites a saved value and lists it as a difference instead', () => {
    const saved: FormState = {
      profile: { ...blank.profile, firstName: 'Cale', positions: ['Forward'] },
      education: { ...emptyEducation(), college: { id: null, other: 'Wayne State College' } },
    };
    const merged = mergeBio(saved, caleBio());
    expect(merged.profile.positions).toEqual(['Forward']);
    expect(merged.education.college).toEqual({ id: null, other: 'Wayne State College' });
    expect(merged.differences).toEqual(['positions', 'college']);
    expect(merged.filled).not.toContain('firstName');
  });

  it('treats the same value with different case or spacing as no difference', () => {
    const saved: FormState = { ...blank, profile: { ...blank.profile, firstName: ' cale ', positions: ['GUARD'] } };
    const merged = mergeBio(saved, caleBio());
    expect(merged.differences).not.toContain('firstName');
    expect(merged.differences).not.toContain('positions');
  });

  it('leaves fields the bio does not cover alone', () => {
    const merged = mergeBio(blank, caleBio());
    expect(merged.education.startYear).toBeNull();
    expect(merged.filled).not.toContain('start');
  });
});

describe('takeBioValue', () => {
  it("replaces one field with the bio's value", () => {
    const saved: FormState = { ...blank, profile: { ...blank.profile, positions: ['Forward'] } };
    expect(takeBioValue(saved, caleBio(), 'positions').profile.positions).toEqual(['Guard']);
  });

  it('sets the sport type with the sport', () => {
    const next = takeBioValue(blank, caleBio(), 'sport');
    expect(next.profile.sport).toBe('Basketball');
    expect(next.profile.sportType).toBe('team');
  });

  it('replaces both parts of a date', () => {
    const bio = caleBio();
    bio.current = bio.previous[0];
    const next = takeBioValue(blank, bio, 'end');
    expect(next.education.endMonth).toBe(5);
    expect(next.education.endYear).toBe(2025);
  });
});

describe('bioFieldText', () => {
  it("shows the bio's own wording", () => {
    const bio = caleBio();
    expect(bioFieldText(bio, 'positions')).toBe('Guard');
    expect(bioFieldText(bio, 'college')).toBe('University of Nebraska-Lincoln');
    expect(bioFieldText(bio, 'degree')).toBe("Master's");
    bio.current = bio.previous[0];
    expect(bioFieldText(bio, 'end')).toBe('May 2025');
    expect(bioFieldText(bio, 'start')).toBe('2022');
  });
});
