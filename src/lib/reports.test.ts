import { describe, expect, it } from 'vitest';
import {
  athleteSummary,
  buildExperienceReport,
  degreeText,
  experienceStatusLabel,
  fieldText,
  formatReportDate,
  graduationText,
  groupNotListed,
  groupTopJobs,
  mostSuggestedJobs,
  schoolText,
  searchAthletes,
  type NotListedRow,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
  type ReportTopJobRow,
} from './reports';

function athlete(id: string, first: string, last: string, overrides: Partial<ReportAthlete> = {}): ReportAthlete {
  return {
    id,
    first_name: first,
    last_name: last,
    college: null,
    degree: null,
    sport: 'Football',
    created_at: '2026-10-06T15:00:00Z',
    college_name: 'University of Nebraska at Omaha',
    college_city: 'Omaha',
    college_state: 'NE',
    college_other: null,
    degree_type: 'BS',
    degree_other: null,
    primary_field_title: 'Computer Science',
    primary_field_other: null,
    grad_month: 5,
    grad_year: 2027,
    ...overrides,
  };
}

function experience(overrides: Partial<ReportExperienceRow>): ReportExperienceRow {
  return {
    id: 'e1',
    athlete_id: 'a1',
    title: 'Golf rehab',
    status: 'confirmed',
    created_at: '2026-10-06T15:00:00Z',
    rubric_version_id: 'v1',
    experience_evidence: [],
    ...overrides,
  };
}

const labels: ReportLabel[] = [
  { rubric_version_id: 'v1', key: 'resilience', label: 'Resilience' },
  { rubric_version_id: 'v1', key: 'discipline', label: 'Discipline' },
  { rubric_version_id: 'v1', key: 'leadership', label: 'Leadership' },
  { rubric_version_id: 'v2', key: 'leadership', label: 'Team Leadership' },
];

const todd = athlete('a1', 'Todd', 'Campbell');
const jane = athlete('a2', 'Jane', 'Smith');

describe('experienceStatusLabel', () => {
  it('names the two reported statuses', () => {
    expect(experienceStatusLabel('mapped')).toBe('Awaiting confirmation');
    expect(experienceStatusLabel('confirmed')).toBe('Confirmed');
  });
});

describe('formatReportDate', () => {
  it('formats a date like Oct 6, 2026', () => {
    expect(formatReportDate('2026-10-06T15:00:00Z')).toBe('Oct 6, 2026');
  });

  it('keeps a late-evening Central entry on the same day', () => {
    // 10:30 pm Central on Oct 6 is already Oct 7 in UTC.
    expect(formatReportDate('2026-10-07T03:30:00Z')).toBe('Oct 6, 2026');
  });
});

describe('buildExperienceReport', () => {
  it('keeps athlete order and gives athletes without experiences an empty list', () => {
    const report = buildExperienceReport([todd, jane], [experience({})], labels);
    expect(report.map((r) => r.athlete.id)).toEqual(['a1', 'a2']);
    expect(report[0].experiences).toHaveLength(1);
    expect(report[1].experiences).toEqual([]);
  });

  it('ignores experiences from athletes not in the list', () => {
    const report = buildExperienceReport([todd], [experience({ athlete_id: 'archived' })], labels);
    expect(report).toHaveLength(1);
    expect(report[0].experiences).toEqual([]);
  });

  it('includes only mapped and confirmed experiences', () => {
    const rows = [
      experience({ id: 'draft', status: 'draft' }),
      experience({ id: 'followup', status: 'needs_followup' }),
      experience({ id: 'failed', status: 'failed' }),
      experience({ id: 'mapped', status: 'mapped' }),
      experience({ id: 'confirmed', status: 'confirmed' }),
    ];
    const ids = buildExperienceReport([todd], rows, labels)[0].experiences.map((e) => e.id);
    expect(ids.sort()).toEqual(['confirmed', 'mapped']);
  });

  it('lists experiences newest first', () => {
    const rows = [
      experience({ id: 'old', created_at: '2026-10-01T15:00:00Z' }),
      experience({ id: 'new', created_at: '2026-10-05T15:00:00Z' }),
    ];
    const ids = buildExperienceReport([todd], rows, labels)[0].experiences.map((e) => e.id);
    expect(ids).toEqual(['new', 'old']);
  });

  it('fills in title, status label, and date', () => {
    const [entry] = buildExperienceReport([todd], [experience({ status: 'mapped' })], labels)[0]
      .experiences;
    expect(entry).toMatchObject({
      title: 'Golf rehab',
      statusLabel: 'Awaiting confirmation',
      date: 'Oct 6, 2026',
    });
  });

  it('shows kept strengths, Strong first, then alphabetical', () => {
    const row = experience({
      experience_evidence: [
        { competency_key: 'resilience', strength: 'moderate', included: true },
        { competency_key: 'leadership', strength: 'strong', included: false },
        { competency_key: 'discipline', strength: 'moderate', included: true },
        { competency_key: 'resilience', strength: 'strong', included: true },
      ],
    });
    // Two items for one key can't happen in real data; it only checks ordering here.
    const [entry] = buildExperienceReport([todd], [row], labels)[0].experiences;
    expect(entry.strengths).toEqual([
      'Resilience (Strong)',
      'Discipline (Moderate)',
      'Resilience (Moderate)',
    ]);
  });

  it('gives an empty strengths list when every strength was removed', () => {
    const row = experience({
      experience_evidence: [{ competency_key: 'leadership', strength: 'strong', included: false }],
    });
    expect(buildExperienceReport([todd], [row], labels)[0].experiences[0].strengths).toEqual([]);
  });

  it("labels strengths with the experience's own rubric version", () => {
    const evidence = [{ competency_key: 'leadership', strength: 'strong' as const, included: true }];
    const rows = [
      experience({ id: 'v1', rubric_version_id: 'v1', experience_evidence: evidence }),
      experience({
        id: 'v2',
        rubric_version_id: 'v2',
        created_at: '2026-10-07T15:00:00Z',
        experience_evidence: evidence,
      }),
    ];
    const strengths = buildExperienceReport([todd], rows, labels)[0].experiences.map(
      (e) => e.strengths[0]
    );
    expect(strengths).toEqual(['Team Leadership (Strong)', 'Leadership (Strong)']);
  });

  it('falls back to a title-cased key when the label is missing', () => {
    const evidence = [{ competency_key: 'time_management', strength: 'strong' as const, included: true }];
    const rows = [
      experience({ id: 'known-version', experience_evidence: evidence }),
      experience({
        id: 'no-version',
        rubric_version_id: null,
        created_at: '2026-10-07T15:00:00Z',
        experience_evidence: evidence,
      }),
    ];
    const strengths = buildExperienceReport([todd], rows, labels)[0].experiences.map(
      (e) => e.strengths[0]
    );
    expect(strengths).toEqual(['Time Management (Strong)', 'Time Management (Strong)']);
  });
});

describe('athlete education text', () => {
  it('describes a picked school, degree, field, and graduation', () => {
    const a = athlete('a1', 'Todd', 'Campbell');
    expect(schoolText(a)).toBe('University of Nebraska at Omaha');
    expect(degreeText(a)).toBe('BS');
    expect(fieldText(a)).toBe('Computer Science');
    expect(graduationText(a)).toBe('May 2027');
    expect(athleteSummary(a)).toBe(
      'University of Nebraska at Omaha · BS, Computer Science · Graduating May 2027 · Football'
    );
  });

  it('shows "not listed" answers as typed', () => {
    const a = athlete('a1', 'Todd', 'Campbell', {
      college_name: null,
      college_city: null,
      college_state: null,
      college_other: 'Hometown CC',
      degree_type: 'OTHER',
      degree_other: 'BSN',
      primary_field_title: null,
      primary_field_other: 'Esports Management',
    });
    expect(athleteSummary(a)).toBe('Hometown CC · BSN, Esports Management · Graduating May 2027 · Football');
  });

  it('falls back to the old typed text for athletes who have not picked yet', () => {
    const a = athlete('a1', 'Todd', 'Campbell', {
      college: 'UNO',
      degree: 'BS - Computer Science',
      college_name: null,
      college_city: null,
      college_state: null,
      degree_type: null,
      primary_field_title: null,
      grad_month: null,
      grad_year: null,
    });
    expect(schoolText(a)).toBe('UNO (not yet picked)');
    expect(degreeText(a)).toBe('BS - Computer Science (not yet picked)');
    expect(graduationText(a)).toBe('');
    expect(athleteSummary(a)).toBe('UNO (not yet picked) · BS - Computer Science (not yet picked) · Football');
  });
});

describe('groupNotListed', () => {
  function row(kind: NotListedRow['kind'], answer: string, id: string, last: string): NotListedRow {
    return { kind, answer, athlete_id: id, first_name: 'A', last_name: last };
  }

  it('groups answers ignoring case and extra spaces, schools first, most athletes first', () => {
    const groups = groupNotListed([
      row('Field of study', 'Esports', 'a1', 'Smith'),
      row('School', 'Iowa Western CC', 'a2', 'Doe'),
      row('School', ' iowa  western cc ', 'a3', 'Adams'),
      row('School', 'Hometown CC', 'a4', 'Brown'),
    ]);
    expect(groups).toEqual([
      { kind: 'School', answer: 'Iowa Western CC', athletes: ['Adams, A', 'Doe, A'] },
      { kind: 'School', answer: 'Hometown CC', athletes: ['Brown, A'] },
      { kind: 'Field of study', answer: 'Esports', athletes: ['Smith, A'] },
    ]);
  });

  it('counts an athlete once per answer, even if typed for primary and secondary', () => {
    const groups = groupNotListed([
      row('Field of study', 'Esports', 'a1', 'Smith'),
      row('Field of study', 'esports', 'a1', 'Smith'),
    ]);
    expect(groups[0].athletes).toEqual(['Smith, A']);
  });
});

function job(athleteId: string, rank: number, code: string, title: string | null, level = 'good'): ReportTopJobRow {
  return { athlete_id: athleteId, created_at: '2026-10-16T15:00:00Z', rank, code, title, level };
}

describe('groupTopJobs', () => {
  it('keeps each athlete jobs in rank order with the date and level text', () => {
    const byAthlete = groupTopJobs([
      job('a1', 2, '15-1252.00', 'Software Developers', 'possible'),
      job('a1', 1, '15-1253.00', 'Software Quality Assurance Analysts and Testers', 'strong'),
    ]);
    expect(byAthlete.get('a1')).toEqual({
      date: formatReportDate('2026-10-16T15:00:00Z'),
      jobs: [
        { rank: 1, title: 'Software Quality Assurance Analysts and Testers', level: 'Strong' },
        { rank: 2, title: 'Software Developers', level: 'Possible' },
      ],
    });
    expect(byAthlete.get('a2')).toBeUndefined();
  });

  it('falls back to the job code when the title is missing', () => {
    expect(groupTopJobs([job('a1', 1, '11-9199.00', null)]).get('a1')?.jobs[0].title).toBe('11-9199.00');
  });
});

describe('mostSuggestedJobs', () => {
  const people = [athlete('a1', 'Joe', 'Athlete'), athlete('a2', 'Ann', 'Baker'), athlete('a3', 'Cal', 'Cole')];

  it('counts athletes per job, most first, then by title, naming who', () => {
    const rows = [
      job('a1', 1, 'A', 'Web Developers'),
      job('a1', 2, 'B', 'Computer Programmers'),
      job('a2', 1, 'B', 'Computer Programmers'),
      job('a3', 1, 'C', 'Accountants'),
    ];
    expect(mostSuggestedJobs(rows, people)).toEqual([
      { code: 'B', title: 'Computer Programmers', athletes: ['Athlete, Joe', 'Baker, Ann'] },
      { code: 'C', title: 'Accountants', athletes: ['Cole, Cal'] },
      { code: 'A', title: 'Web Developers', athletes: ['Athlete, Joe'] },
    ]);
  });

  it('leaves out athletes who are not in the report list', () => {
    expect(mostSuggestedJobs([job('x9', 1, 'A', 'Web Developers')], people)).toEqual([]);
  });
});

describe('searchAthletes', () => {
  const joe = athlete('a1', 'Joe', 'Athlete', { email: 'toddtest3@gmail.com', sport: 'Weightlifting' });
  const mary = athlete('a2', 'Mary', 'Smith', {
    email: 'mary@example.com',
    sport: 'Golf',
    college_name: 'Creighton University',
  });
  const all = [joe, mary];

  it('returns everyone for a blank search', () => {
    expect(searchAthletes(all, '   ')).toEqual(all);
  });

  it('matches first name, last name, or full name, ignoring case', () => {
    expect(searchAthletes(all, 'MARY')).toEqual([mary]);
    expect(searchAthletes(all, 'athlete')).toEqual([joe]);
    expect(searchAthletes(all, 'joe athlete')).toEqual([joe]);
  });

  it('matches email, school, and sport', () => {
    expect(searchAthletes(all, 'toddtest3')).toEqual([joe]);
    expect(searchAthletes(all, 'creighton')).toEqual([mary]);
    expect(searchAthletes(all, 'golf')).toEqual([mary]);
  });

  it('needs every word to match somewhere', () => {
    expect(searchAthletes(all, 'mary golf')).toEqual([mary]);
    expect(searchAthletes(all, 'mary weightlifting')).toEqual([]);
  });

  it('works when the email column is missing', () => {
    expect(searchAthletes([athlete('a3', 'Sam', 'Lee')], 'sam')).toHaveLength(1);
  });
});
