// A hash of everything that feeds top jobs, so an unchanged student gets their saved
// results without scoring again or calling Claude. Lists are sorted first, so the order
// the database returns rows in never matters.

import { createHash } from 'node:crypto';

export interface Versions {
  rubricVersionId: string;
  tablesVersionId: string;
  reference: string;
  scoring: number;
}

export interface InputsSummary {
  experiences: number;
  honors: number;
  hasBio: boolean;
}

export interface FingerprintInput {
  sport: string;
  positions: string[];
  disciplines: string[];
  fieldCodes: string[];
  selfScores: Record<string, number>;
  experiences: { id: string; updatedAt: string; evidence: { competencyKey: string; strength: string }[] }[];
  honorTitles: string[];
  bioImportId: string | null;
  versions: Versions;
}

const sorted = (items: string[]) => [...items].sort();

export function fingerprint(input: FingerprintInput): string {
  const canonical = {
    sport: input.sport,
    positions: sorted(input.positions),
    disciplines: sorted(input.disciplines),
    fieldCodes: sorted(input.fieldCodes),
    selfScores: Object.entries(input.selfScores).sort(([a], [b]) => a.localeCompare(b)),
    experiences: [...input.experiences]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => [e.id, e.updatedAt, sorted(e.evidence.map((item) => `${item.competencyKey}:${item.strength}`))]),
    honorTitles: sorted(input.honorTitles),
    bioImportId: input.bioImportId,
    versions: [input.versions.rubricVersionId, input.versions.tablesVersionId, input.versions.reference, input.versions.scoring],
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function changedLine(saved: InputsSummary, current: InputsSummary): string {
  if (current.experiences > saved.experiences) {
    return `You've added ${plural(current.experiences - saved.experiences, 'experience')} since these results.`;
  }
  if (current.honors > saved.honors) {
    return `You've added ${plural(current.honors - saved.honors, 'honor')} since these results.`;
  }
  return 'Your profile has changed since these results.';
}

export function basedOnLine(summary: InputsSummary): string {
  const parts = ['your profile', 'self-assessment'];
  if (summary.experiences > 0) parts.push(plural(summary.experiences, 'experience'));
  if (summary.honors > 0) parts.push(plural(summary.honors, 'honor'));
  if (summary.hasBio) parts.push('your bio');
  const list = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
  return `Based on ${list}.`;
}
