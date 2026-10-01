import type { SupabaseClient } from '@supabase/supabase-js';

export type ExampleRating = 'strong' | 'moderate' | 'not_evidence';

export interface RubricExample {
  story: string;
  rating: ExampleRating;
  why?: string;
}

export interface RubricCompetency {
  key: string;
  label: string;
  definition: string;
  strong_evidence: string;
  moderate_evidence: string;
  not_evidence: string;
  examples: RubricExample[];
}

export interface RubricVersionRow {
  id: string;
  version: number;
  published_at: string | null;
}

export interface Rubric {
  id: string;
  version: number;
  competencies: RubricCompetency[];
}

// Highest published version wins. Drafts count only when allowDraft is on (local development).
export function pickCurrentRubric(
  versions: RubricVersionRow[],
  allowDraft: boolean
): RubricVersionRow | null {
  const usable = versions.filter((v) => allowDraft || v.published_at !== null);
  if (usable.length === 0) {
    return null;
  }
  return usable.reduce((best, v) => (v.version > best.version ? v : best));
}

// A version with no competencies loaded yet can't score anything, so it counts as no rubric.
export function toRubric(
  version: RubricVersionRow,
  competencies: RubricCompetency[]
): Rubric | null {
  if (competencies.length === 0) {
    return null;
  }
  return { id: version.id, version: version.version, competencies };
}

// Shows the rubric's name for a competency, or a readable form of the key when the
// rubric it was scored against no longer has it.
export function competencyLabel(
  key: string,
  competencies: Pick<RubricCompetency, 'key' | 'label'>[]
): string {
  const match = competencies.find((c) => c.key === key);
  if (match) {
    return match.label;
  }
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Set only in .env.local. Never set in Vercel, so the live site ignores draft rubrics.
export function allowDraftRubric(): boolean {
  return process.env.ALLOW_DRAFT_RUBRIC === 'true';
}

const COMPETENCY_COLUMNS =
  'key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples';

export async function getRubricCompetencies(
  supabase: SupabaseClient,
  versionId: string
): Promise<RubricCompetency[]> {
  const { data } = await supabase
    .from('rubric_competencies')
    .select(COMPETENCY_COLUMNS)
    .eq('rubric_version_id', versionId)
    .order('label');
  return (data ?? []) as RubricCompetency[];
}

export async function getCurrentRubric(supabase: SupabaseClient): Promise<Rubric | null> {
  const { data: versions } = await supabase
    .from('rubric_versions')
    .select('id, version, published_at');

  const current = pickCurrentRubric((versions ?? []) as RubricVersionRow[], allowDraftRubric());
  if (!current) {
    return null;
  }
  return toRubric(current, await getRubricCompetencies(supabase, current.id));
}

export async function getRubricByVersion(
  supabase: SupabaseClient,
  version: number
): Promise<Rubric | null> {
  const { data } = await supabase
    .from('rubric_versions')
    .select('id, version, published_at')
    .eq('version', version)
    .maybeSingle();

  if (!data) {
    return null;
  }
  const row = data as RubricVersionRow;
  return toRubric(row, await getRubricCompetencies(supabase, row.id));
}
