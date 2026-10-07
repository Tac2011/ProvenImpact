import { competencyLabel } from './rubric';
import type { ExperienceStatus, Strength } from './experiences';

// The experience report shows results the athlete has seen, confirmed or not.
export const REPORTED_STATUSES: ExperienceStatus[] = ['mapped', 'confirmed'];

export interface ReportAthlete {
  id: string;
  first_name: string;
  last_name: string;
  college: string;
  degree: string;
  sport: string;
  created_at: string;
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
