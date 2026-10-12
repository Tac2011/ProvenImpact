import { competencyLabel } from './rubric';
import type { ExperienceStatus, Strength } from './experiences';
import { degreeShort, formatMonthYear, type DegreeType } from './education';

// The experience report shows results the athlete has seen, confirmed or not.
export const REPORTED_STATUSES: ExperienceStatus[] = ['mapped', 'confirmed'];

export interface ReportAthlete {
  id: string;
  first_name: string;
  last_name: string;
  college: string | null; // old free text, shown until the athlete picks from the list
  degree: string | null; // old free text
  sport: string;
  created_at: string;
  college_name: string | null;
  college_city: string | null;
  college_state: string | null;
  college_other: string | null;
  degree_type: DegreeType | null; // null when the athlete has no current school yet
  degree_other: string | null;
  primary_field_title: string | null;
  primary_field_other: string | null;
  grad_month: number | null;
  grad_year: number | null;
}

export interface ReportExperienceRow {
  id: string;
  athlete_id: string;
  title: string;
  status: ExperienceStatus;
  created_at: string;
  rubric_version_id: string | null;
  experience_evidence: { competency_key: string; strength: Strength; included: boolean }[];
}

export interface ReportLabel {
  rubric_version_id: string;
  key: string;
  label: string;
}

export interface ReportExperience {
  id: string;
  title: string;
  statusLabel: string;
  date: string;
  strengths: string[];
}

export interface AthleteExperiences {
  athlete: ReportAthlete;
  experiences: ReportExperience[];
}

const STRENGTH_LABELS: Record<Strength, string> = { strong: 'Strong', moderate: 'Moderate' };

export function experienceStatusLabel(status: ExperienceStatus): string {
  return status === 'confirmed' ? 'Confirmed' : 'Awaiting confirmation';
}

// Vercel runs in UTC, so pin Central time or evening entries show tomorrow's date.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/Chicago',
});

export function formatReportDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

function strengthsFor(row: ReportExperienceRow, labels: ReportLabel[]): string[] {
  const versionLabels = labels.filter((l) => l.rubric_version_id === row.rubric_version_id);
  return row.experience_evidence
    .filter((item) => item.included)
    .map((item) => ({
      strength: item.strength,
      label: competencyLabel(item.competency_key, versionLabels),
    }))
    .sort(
      (a, b) =>
        Number(b.strength === 'strong') - Number(a.strength === 'strong') ||
        a.label.localeCompare(b.label)
    )
    .map((item) => `${item.label} (${STRENGTH_LABELS[item.strength]})`);
}

export function buildExperienceReport(
  athletes: ReportAthlete[],
  experiences: ReportExperienceRow[],
  labels: ReportLabel[]
): AthleteExperiences[] {
  const reported = experiences
    .filter((row) => REPORTED_STATUSES.includes(row.status))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return athletes.map((athlete) => ({
    athlete,
    experiences: reported
      .filter((row) => row.athlete_id === athlete.id)
      .map((row) => ({
        id: row.id,
        title: row.title,
        statusLabel: experienceStatusLabel(row.status),
        date: formatReportDate(row.created_at),
        strengths: strengthsFor(row, labels),
      })),
  }));
}

const NOT_PICKED = ' (not yet picked)';

export function schoolText(a: ReportAthlete): string {
  if (a.degree_type !== null) return a.college_name ?? a.college_other ?? '';
  return a.college ? `${a.college}${NOT_PICKED}` : '';
}

export function degreeText(a: ReportAthlete): string {
  if (a.degree_type !== null) return degreeShort(a.degree_type, a.degree_other);
  return a.degree ? `${a.degree}${NOT_PICKED}` : '';
}

export function fieldText(a: ReportAthlete): string {
  return a.primary_field_title ?? a.primary_field_other ?? '';
}

export function graduationText(a: ReportAthlete): string {
  return a.grad_month !== null && a.grad_year !== null ? formatMonthYear(a.grad_month, a.grad_year) : '';
}

export function athleteSummary(a: ReportAthlete): string {
  const degreeAndField = [degreeText(a), fieldText(a)].filter(Boolean).join(', ');
  const graduation = graduationText(a);
  return [schoolText(a), degreeAndField, graduation && `Graduating ${graduation}`, a.sport]
    .filter(Boolean)
    .join(' · ');
}

export interface NotListedRow {
  kind: 'School' | 'Field of study';
  answer: string;
  athlete_id: string;
  first_name: string;
  last_name: string;
}

export interface NotListedGroup {
  kind: 'School' | 'Field of study';
  answer: string;
  athletes: string[];
}

export function groupNotListed(rows: NotListedRow[]): NotListedGroup[] {
  const groups = new Map<string, { kind: NotListedRow['kind']; answer: string; athletes: Map<string, string> }>();

  for (const row of rows) {
    const answer = row.answer.trim().replace(/\s+/g, ' ');
    if (!answer) continue;
    const key = `${row.kind}|${answer.toLowerCase()}`;
    const group = groups.get(key) ?? { kind: row.kind, answer, athletes: new Map<string, string>() };
    group.athletes.set(row.athlete_id, `${row.last_name}, ${row.first_name}`);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((g) => ({
      kind: g.kind,
      answer: g.answer,
      athletes: [...g.athletes.values()].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        Number(b.kind === 'School') - Number(a.kind === 'School') ||
        b.athletes.length - a.athletes.length ||
        a.answer.localeCompare(b.answer)
    );
}
