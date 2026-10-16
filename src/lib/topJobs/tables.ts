import type { SupabaseClient } from '@supabase/supabase-js';
import { allowDraftRubric, getRubricCompetencies, pickCurrentRubric, type RubricCompetency } from '../rubric';
import type { SelfMap } from './score';

export interface TopJobsTables {
  id: string;
  version: number;
  rubric_version_id: string;
  self_map: SelfMap;
  open_list: { code: string; reason: string }[];
  published_at: string | null;
}

// Same rule as the rubric: the newest published version, or the newest draft when
// ALLOW_DRAFT_RUBRIC=true locally.
export async function getTopJobsTables(supabase: SupabaseClient): Promise<TopJobsTables | null> {
  const { data } = await supabase
    .from('top_jobs_tables')
    .select('id, version, rubric_version_id, self_map, open_list, published_at');
  return pickCurrentRubric((data ?? []) as TopJobsTables[], allowDraftRubric());
}

// The rubric these tables were built for. Job needs are keyed by its competencies, so
// scoring must use it even after a newer rubric is published; otherwise the newer
// competencies would find no needs and strength fit would quietly drop to zero.
export async function getTablesRubric(
  supabase: SupabaseClient,
  tables: TopJobsTables
): Promise<{ id: string; competencies: RubricCompetency[] }> {
  return { id: tables.rubric_version_id, competencies: await getRubricCompetencies(supabase, tables.rubric_version_id) };
}

// The header asks this on every page, so it skips the large columns.
export async function topJobsAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from('top_jobs_tables').select('id, version, published_at');
  return pickCurrentRubric((data ?? []) as { id: string; version: number; published_at: string | null }[], allowDraftRubric()) !== null;
}
