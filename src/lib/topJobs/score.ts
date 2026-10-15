// Top jobs scoring: strength profile, degree fit, score, rank, levels, and the early
// results note. Pure and deterministic: the same input always gives the same list.

import {
  EARLY_MIN_GOOD,
  ENOUGH_EXPERIENCES,
  EVIDENCE_POINTS,
  EVIDENCE_SCALE,
  EVIDENCE_SHARE,
  EXTRA_FIELD_BONUS,
  FEW_EXPERIENCES,
  FIELD_WEIGHTS,
  LEVELS,
  OPEN_DEGREE_FIT,
  OUTLOOK,
  PROOF_WEIGHT,
  SELF_ONLY_CAP,
  TAG_MIN,
} from './constants';

export type Strength = 'strong' | 'moderate';
export type Needs = Record<string, number>;
export type SelfMap = Record<string, Record<string, number>>;
export type MatchLevel = 'strong' | 'good' | 'possible';

export interface EvidenceItem {
  competencyKey: string;
  strength: Strength;
}

export interface StudentField {
  code: string;
  title: string;
  weight: number;
}

export interface EducationFields {
  isCurrent: boolean;
  primaryCode: string | null;
  secondaryCode: string | null;
}

export interface RankedJob {
  code: string;
  score: number; // 0 to 100, whole number
  level: MatchLevel;
  tags: string[]; // rubric competency keys, strongest first
  linkedFields: string[]; // field titles; empty means open to any major
}

export interface ScoringInput {
  competencies: string[];
  evidence: EvidenceItem[];
  experienceCount: number;
  selfScores: Record<string, number>;
  selfMap: SelfMap;
  fields: StudentField[];
  fieldOccupations: Record<string, string[]>; // CIP 4-digit code to O*NET codes
  openList: string[];
  needs: Record<string, Needs>; // only occupations with needs are scored
  titles: Record<string, string>;
}

export function fieldsFromEducation(rows: EducationFields[], titles: Record<string, string>): StudentField[] {
  const fields: StudentField[] = [];
  const add = (code: string | null, weight: number) => {
    if (code) fields.push({ code, title: titles[code] ?? code, weight });
  };
  for (const row of rows) {
    add(row.primaryCode, row.isCurrent ? FIELD_WEIGHTS.currentPrimary : FIELD_WEIGHTS.previousPrimary);
    add(row.secondaryCode, row.isCurrent ? FIELD_WEIGHTS.currentSecondary : FIELD_WEIGHTS.previousSecondary);
  }
  return fields;
}

export function strengthProfile(
  competencies: string[],
  evidence: EvidenceItem[],
  selfScores: Record<string, number>,
  selfMap: SelfMap
): Record<string, number> {
  const points: Record<string, number> = {};
  for (const item of evidence) {
    points[item.competencyKey] = (points[item.competencyKey] ?? 0) + EVIDENCE_POINTS[item.strength];
  }

  // Self-assessment: 1 to 5 scaled to 0 to 1, averaged per competency by map weight.
  const selfTotal: Record<string, number> = {};
  const selfWeight: Record<string, number> = {};
  for (const [itemKey, score] of Object.entries(selfScores)) {
    const scaled = Math.min(Math.max((score - 1) / 4, 0), 1);
    for (const [competency, weight] of Object.entries(selfMap[itemKey] ?? {})) {
      selfTotal[competency] = (selfTotal[competency] ?? 0) + weight * scaled;
      selfWeight[competency] = (selfWeight[competency] ?? 0) + weight;
    }
  }

  return Object.fromEntries(
    competencies.map((competency) => {
      const self = selfWeight[competency] ? selfTotal[competency] / selfWeight[competency] : 0;
      const p = points[competency] ?? 0;
      const strength =
        p > 0
          ? EVIDENCE_SHARE * (1 - Math.exp(-p / EVIDENCE_SCALE)) + (1 - EVIDENCE_SHARE) * self
          : SELF_ONLY_CAP * self;
      return [competency, strength];
    })
  );
}

export function degreeFits(
  fields: StudentField[],
  fieldOccupations: Record<string, string[]>
): Map<string, { fit: number; titles: string[] }> {
  // One entry per field code, at its best weight, so a field on two schools counts once.
  const best = new Map<string, StudentField>();
  for (const field of fields) {
    const current = best.get(field.code);
    if (!current || field.weight > current.weight) best.set(field.code, field);
  }

  const links = new Map<string, { weights: number[]; titles: string[] }>();
  for (const field of best.values()) {
    for (const code of fieldOccupations[field.code] ?? []) {
      const link = links.get(code) ?? { weights: [], titles: [] };
      link.weights.push(field.weight);
      link.titles.push(field.title);
      links.set(code, link);
    }
  }

  return new Map(
    [...links].map(([code, link]) => [
      code,
      {
        fit: Math.min(1, Math.max(...link.weights) + EXTRA_FIELD_BONUS * (link.weights.length - 1)),
        titles: link.titles,
      },
    ])
  );
}

export function proofWeight(experienceCount: number): number {
  return Math.min(PROOF_WEIGHT.max, PROOF_WEIGHT.base + PROOF_WEIGHT.perExperience * experienceCount);
}

export function matchLevel(score: number, experienceCount: number): MatchLevel {
  if (score >= LEVELS.strong && experienceCount >= FEW_EXPERIENCES) return 'strong';
  if (score >= LEVELS.good) return 'good';
  return 'possible';
}

export function rankJobs(input: ScoringInput): RankedJob[] {
  const strengths = strengthProfile(input.competencies, input.evidence, input.selfScores, input.selfMap);
  const fits = degreeFits(input.fields, input.fieldOccupations);
  const w = proofWeight(input.experienceCount);
  const open = new Set(input.openList);
  const candidates = new Set([...fits.keys(), ...input.openList]);

  const ranked = [...candidates]
    .filter((code) => input.needs[code])
    .map((code) => {
      const needs = input.needs[code];
      const link = fits.get(code);
      const fit = Math.max(link?.fit ?? 0, open.has(code) ? OPEN_DEGREE_FIT : 0);
      const products = input.competencies.map((c) => [c, (needs[c] ?? 0) * (strengths[c] ?? 0)] as const);
      const strengthFit = products.reduce((sum, [, value]) => sum + value, 0);
      const score = Math.round(100 * ((1 - w) * fit + w * strengthFit));
      const tags = products
        .filter(([, value]) => value > TAG_MIN)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);
      return {
        code,
        score,
        level: matchLevel(score, input.experienceCount),
        tags,
        linkedFields: link?.titles ?? [],
      };
    });

  const title = (code: string) => input.titles[code] ?? code;
  return ranked.sort((a, b) => b.score - a.score || title(a.code).localeCompare(title(b.code)));
}

export function earlyNote(
  top: RankedJob[],
  ctx: { hasCodedField: boolean; experienceCount: number; inProgressCount: number }
): string | null {
  const goodCount = top.filter((job) => job.level !== 'possible').length;
  const thin = goodCount < EARLY_MIN_GOOD || ctx.experienceCount < FEW_EXPERIENCES || !ctx.hasCodedField;
  if (!thin) return null;

  const asks: string[] = [];
  if (!ctx.hasCodedField) asks.push('add your field of study');
  if (ctx.experienceCount < ENOUGH_EXPERIENCES) asks.push('add a few more experiences');
  if (ctx.inProgressCount > 0) asks.push('finish your in-progress experiences');
  if (asks.length === 0) asks.push('add more experiences');

  const [first, second] = asks;
  const joined = second
    ? `${first} and ${first.startsWith('add ') && second.startsWith('add ') ? second.slice(4) : second}`
    : first;
  return `These are early results. ${joined[0].toUpperCase()}${joined.slice(1)}, and your matches will sharpen.`;
}

export function degreeLinkText(titles: string[]): string {
  if (titles.length === 0) return 'Open to any major';
  if (titles.length === 1) return `Linked to your ${titles[0]} degree`;
  const list =
    titles.length === 2 ? `${titles[0]} and ${titles[1]}` : `${titles.slice(0, -1).join(', ')}, and ${titles.at(-1)}`;
  return `Linked to your ${list} degrees`;
}

export function payText(wage: number | null): string {
  return wage === null ? 'Pay data not available' : `$${wage.toLocaleString('en-US')} typical pay`;
}

export function outlookText(growthPct: number | null): string {
  if (growthPct === null) return 'Outlook data not available';
  return OUTLOOK.find((band) => growthPct >= band.min)?.text ?? 'Outlook data not available';
}
