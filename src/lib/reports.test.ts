import { describe, expect, it } from 'vitest';
import {
  buildExperienceReport,
  experienceStatusLabel,
  formatReportDate,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
} from './reports';

function athlete(id: string, first: string, last: string): ReportAthlete {
  return {
    id,
    first_name: first,
    last_name: last,
    college: 'UNO',
    degree: 'Business',
    sport: 'Golf',
    created_at: '2026-10-06T15:00:00Z',
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
