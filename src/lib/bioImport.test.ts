import { describe, expect, it } from 'vitest';
import {
  checkBioOutput,
  checkPaste,
  cleanHonors,
  honorLine,
  matchPick,
  possibleFamilyDetails,
  schoolSummary,
} from './bioImport';
import { caleOutput, colleges, ctx, fields } from './__fixtures__/bioOutput';

describe('checkPaste', () => {
  it('trims and accepts a bio up to 15,000 characters', () => {
    expect(checkPaste(`  ${'x'.repeat(15000)}  `)).toEqual({ ok: true, text: 'x'.repeat(15000) });
  });

  it('refuses 15,001 characters', () => {
    expect(checkPaste('x'.repeat(15001))).toEqual({ ok: false, error: 'too_long' });
  });

  it('treats blank or non-text as empty', () => {
    expect(checkPaste('   \n ')).toEqual({ ok: false, error: 'empty' });
    expect(checkPaste(42)).toEqual({ ok: false, error: 'empty' });
  });
});

describe('matchPick', () => {
  it('fills on an exact name match', () => {
    expect(matchPick(colleges, 'University of Nebraska-Lincoln')).toEqual({ id: '1', other: null });
  });

  it('fills when only one option matches', () => {
    expect(matchPick(colleges, 'Creighton')).toEqual({ id: '3', other: null });
    expect(matchPick(fields, 'Business Administration')).toEqual({ id: '52.0201', other: null });
  });

  it('leaves it blank when the name is ambiguous or unknown', () => {
    expect(matchPick(colleges, 'Nebraska')).toBeNull();
    expect(matchPick(colleges, 'University of Colorado')).toBeNull();
    expect(matchPick(colleges, '  ')).toBeNull();
  });

  it('leaves it blank when two schools share the exact name', () => {
    const twins = [
      { id: '10', label: 'Westminster College', detail: 'Salt Lake City, UT', nicknames: [] },
      { id: '11', label: 'Westminster College', detail: 'New Wilmington, PA', nicknames: [] },
    ];
    expect(matchPick(twins, 'Westminster College')).toBeNull();
  });
});

describe('cleanHonors', () => {
  it('trims, drops blanks and duplicates, and skips honors already on the list', () => {
    const honors = cleanHonors(
      [
        { title: '  Academic All-Big Ten ', years: ' 2024 ' },
        { title: 'ACADEMIC ALL-BIG TEN', years: '2025' },
        { title: '', years: '2025' },
        { title: 'NABC Honors Court', years: '2023' },
        'not an honor',
      ],
      ['nabc honors court']
    );
    expect(honors).toEqual([{ title: 'Academic All-Big Ten', years: '2024' }]);
  });

  it('caps title and years length', () => {
    const [honor] = cleanHonors([{ title: 'x'.repeat(300), years: 'y'.repeat(300) }], []);
    expect(honor.title).toHaveLength(200);
    expect(honor.years).toHaveLength(100);
  });

  it('keeps at most 30', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: `Honor ${i}`, years: '' }));
    expect(cleanHonors(many, [])).toHaveLength(30);
  });
});

describe('checkBioOutput', () => {
  it('refuses output that does not match the schema', () => {
    expect(checkBioOutput({ first_name: 'Cale' }, ctx)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses an empty cleaned bio or one longer than the paste', () => {
    expect(checkBioOutput({ ...caleOutput(), cleaned_bio: '  ' }, ctx)).toEqual({ ok: false, reason: 'unreadable' });
    expect(checkBioOutput(caleOutput(), { ...ctx, pastedLength: 10 })).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('turns escaped angle brackets back into text', () => {
    const result = checkBioOutput({ ...caleOutput(), cleaned_bio: 'Ran a &lt;4:00 mile.' }, ctx);
    expect(result.ok && result.cleanedText).toBe('Ran a <4:00 mile.');
  });

  it('matches the sport ignoring case and keeps positions only for a team sport', () => {
    const result = checkBioOutput(caleOutput(), ctx);
    expect(result.ok && result.bio.profile).toEqual({
      firstName: 'Cale',
      lastName: 'Jacobsen',
      sport: 'Basketball',
      sportType: 'team',
      positions: ['Guard'],
      disciplines: [],
      sportText: 'basketball',
    });
  });

  it('leaves an unknown sport blank but keeps the bio wording for the hint', () => {
    const result = checkBioOutput({ ...caleOutput(), sport: 'Lacrosse' }, ctx);
    expect(result.ok && result.bio.profile.sport).toBe('');
    expect(result.ok && result.bio.profile.sportText).toBe('Lacrosse');
    expect(result.ok && result.bio.profile.positions).toEqual([]);
  });

  it("splits current and previous schools and maps a master's to Other", () => {
    const result = checkBioOutput(caleOutput(), ctx);
    if (!result.ok) throw new Error('expected ok');
    expect(result.bio.current?.values.college).toEqual({ id: '1', other: null });
    expect(result.bio.current?.values.degreeType).toBe('OTHER');
    expect(result.bio.current?.values.degreeOther).toBe("Master's");
    expect(result.bio.previous).toHaveLength(1);
    expect(result.bio.previous[0].values).toMatchObject({
      degreeType: 'BBA',
      primaryField: { id: '52.0201', other: null },
      startMonth: null,
      startYear: 2022,
      endMonth: 5,
      endYear: 2025,
    });
  });

  it('leaves an ambiguous school blank and keeps the bio wording', () => {
    const output = caleOutput();
    output.schools[0].college = 'Nebraska';
    const result = checkBioOutput(output, ctx);
    expect(result.ok && result.bio.current?.values.college).toEqual({ id: null, other: null });
    expect(result.ok && result.bio.current?.collegeText).toBe('Nebraska');
  });

  it('drops years outside the dropdown range, and a month without its year', () => {
    const output = caleOutput();
    output.schools[1] = { ...output.schools[1], start_month: 8, start_year: 1990, end_month: 13, end_year: 2025 };
    const result = checkBioOutput(output, ctx);
    expect(result.ok && result.bio.previous[0].values).toMatchObject({
      startMonth: null,
      startYear: null,
      endMonth: null,
      endYear: 2025,
    });
  });

  it('does not accept No degree for the current school', () => {
    const output = caleOutput();
    output.schools[0].degree_type = 'NONE';
    const result = checkBioOutput(output, ctx);
    expect(result.ok && result.bio.current?.values.degreeType).toBe('');
  });

  it('cleans honors against the existing list', () => {
    const result = checkBioOutput(caleOutput(), { ...ctx, existingHonors: ['Tom Osborne Citizenship Team'] });
    expect(result.ok && result.bio.honors).toEqual([
      { title: 'Academic All-Big Ten', years: '2024, 2025, 2026' },
    ]);
  });

  it('drops blank ideas and ideas repeated from earlier imports, ignoring case and punctuation', () => {
    const output = caleOutput();
    output.story_ideas.push({ prompt: 'What made you walk on at Nebraska?', source: 'bio' });
    const result = checkBioOutput(output, {
      ...ctx,
      earlierIdeas: ['you tore your ACL in your first game as a junior what did you do next'],
    });
    expect(result.ok && result.bio.ideas).toEqual([
      { prompt: 'What made you walk on at Nebraska?', source: 'bio' },
    ]);
  });

  it('keeps at most 12 ideas', () => {
    const output = caleOutput();
    output.story_ideas = Array.from({ length: 20 }, (_, i) => ({ prompt: `Idea number ${i}?`, source: 'bio' as const }));
    const result = checkBioOutput(output, ctx);
    expect(result.ok && result.bio.ideas).toHaveLength(12);
  });

  it('reports empty when nothing usable came back', () => {
    const result = checkBioOutput(
      {
        cleaned_bio: 'Some text.',
        first_name: '',
        last_name: '',
        sport: '',
        positions: [],
        disciplines: [],
        schools: [],
        honors: [],
        story_ideas: [],
      },
      ctx
    );
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('display helpers', () => {
  it('formats an honor with and without years', () => {
    expect(honorLine({ title: 'NABC Honors Court', years: '2023, 2024' })).toBe('NABC Honors Court · 2023, 2024');
    expect(honorLine({ title: 'NABC Honors Court', years: '' })).toBe('NABC Honors Court');
  });

  it('summarizes a school from the bio', () => {
    const result = checkBioOutput(caleOutput(), ctx);
    if (!result.ok) throw new Error('expected ok');
    expect(schoolSummary(result.bio.previous[0])).toBe(
      'University of Nebraska-Lincoln · BBA · Business Administration · 2022 to May 2025'
    );
  });
});

describe('possibleFamilyDetails', () => {
  it('flags sentences about family or birthdates', () => {
    const text =
      'Jacobsen is a guard. The son of Brad and Staci Jacobsen, Cale was born on June 20, 2003, in Omaha. He has three brothers (Tyler, Dane and Tate). He studies business.';
    expect(possibleFamilyDetails(text)).toEqual([
      'The son of Brad and Staci Jacobsen, Cale was born on June 20, 2003, in Omaha.',
      'He has three brothers (Tyler, Dane and Tate).',
    ]);
  });

  it('returns nothing for a clean bio', () => {
    expect(possibleFamilyDetails('Jacobsen is a guard. He studies business.')).toEqual([]);
  });
});
