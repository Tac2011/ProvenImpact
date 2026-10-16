'use server';

import { createClient } from '@/lib/supabase/server';
import { checkAndLogRun } from '@/lib/aiRuns';
import { requestJobExplanations } from '@/lib/claude';

import { REFERENCE_VERSION, SCORING_VERSION, TOP_COUNT } from '@/lib/topJobs/constants';
import { checkExplanations, reusableExplanations, type JobToExplain } from '@/lib/topJobs/explain';
import { rankJobs, type Needs } from '@/lib/topJobs/score';
import { getTablesRubric, getTopJobsTables } from '@/lib/topJobs/tables';
import type { Versions } from '@/lib/topJobs/fingerprint';
import { fingerprintFor, loadLatestResults, loadStudentInputs, summaryFor } from './load';

export type GenerateResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = 'Please log in again.';
const NOT_READY = 'Finish your profile and self-assessment to see your top jobs.';
const FAILED = "We couldn't find your matches. Please try again.";

export async function generateTopJobs(): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const tables = await getTopJobsTables(supabase);
  if (!tables) return { ok: false, error: FAILED };
  const rubric = await getTablesRubric(supabase, tables);

  const inputs = await loadStudentInputs(supabase, user.id);
  if (!inputs.hasProfile || !inputs.assessmentComplete) return { ok: false, error: NOT_READY };

  const versions: Versions = {
    rubricVersionId: rubric.id,
    tablesVersionId: tables.id,
    reference: REFERENCE_VERSION,
    scoring: SCORING_VERSION,
  };
  const currentFingerprint = fingerprintFor(inputs, versions);
  const [latest] = await loadLatestResults(supabase, user.id, 1);

  // Ranking: reuse it when nothing changed (Try again for missing explanations).
  let ranked = latest?.fingerprint === currentFingerprint ? latest.ranked : null;
  if (!ranked) {
    const codes = [...new Set(inputs.fields.map((f) => f.code))];
    const { data: links } = codes.length
      ? await supabase.from('field_occupations').select('cip_code, occupation_code').in('cip_code', codes)
      : { data: [] };
    const fieldOccupations: Record<string, string[]> = {};
    for (const link of (links ?? []) as { cip_code: string; occupation_code: string }[]) {
      (fieldOccupations[link.cip_code] ??= []).push(link.occupation_code);
    }
    const openList = tables.open_list.map((item) => item.code);
    const candidates = [...new Set([...Object.values(fieldOccupations).flat(), ...openList])];
    const [needsResult, titlesResult] = await Promise.all([
      supabase.from('occupation_needs').select('occupation_code, needs').eq('tables_id', tables.id).in('occupation_code', candidates),
      supabase.from('occupations').select('code, title').in('code', candidates),
    ]);
    if (needsResult.error || titlesResult.error) return { ok: false, error: FAILED };

    ranked = rankJobs({
      competencies: rubric.competencies.map((c) => c.key),
      evidence: inputs.evidence,
      experienceCount: inputs.experienceCount,
      selfScores: inputs.selfScores,
      selfMap: tables.self_map,
      fields: inputs.fields,
      fieldOccupations,
      openList,
      needs: Object.fromEntries(((needsResult.data ?? []) as { occupation_code: string; needs: Needs }[]).map((n) => [n.occupation_code, n.needs])),
      titles: Object.fromEntries(((titlesResult.data ?? []) as { code: string; title: string }[]).map((o) => [o.code, o.title])),
    });
  }

  const top = ranked.slice(0, TOP_COUNT);
  const topCodes = top.map((job) => job.code);
  const explanations = reusableExplanations(latest?.explanations ?? {}, topCodes, inputs.material);
  const missing = top.filter((job) => !explanations[job.code]);

  if (latest && latest.fingerprint === currentFingerprint && missing.length === 0) {
    return { ok: true };
  }

  if (missing.length > 0) {
    const run = await checkAndLogRun(supabase, user.id);
    if (!run.ok) return run;

    const [occupationResult, needsResult] = await Promise.all([
      supabase.from('occupations').select('code, title, description').in('code', missing.map((j) => j.code)),
      supabase.from('occupation_needs').select('occupation_code, needs').eq('tables_id', tables.id).in('occupation_code', missing.map((j) => j.code)),
    ]);
    const occupations = new Map(((occupationResult.data ?? []) as { code: string; title: string; description: string }[]).map((o) => [o.code, o]));
    const needsByCode = new Map(((needsResult.data ?? []) as { occupation_code: string; needs: Needs }[]).map((n) => [n.occupation_code, n.needs]));
    const label = (key: string) => rubric.competencies.find((c) => c.key === key)?.label ?? key;

    const jobs: JobToExplain[] = missing.flatMap((job) => {
      const occupation = occupations.get(job.code);
      if (!occupation) return [];
      const needs = needsByCode.get(job.code) ?? {};
      return [
        {
          code: job.code,
          title: occupation.title,
          description: occupation.description,
          needs: Object.entries(needs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([key]) => label(key)),
        },
      ];
    });
    const raw = jobs.length ? await requestJobExplanations(jobs, inputs.material) : null;
    Object.assign(explanations, raw === null ? {} : checkExplanations(raw, jobs, inputs.material));
  }

  const { error } = await supabase.from('top_job_results').insert({
    athlete_id: user.id,
    fingerprint: currentFingerprint,
    inputs_summary: summaryFor(inputs),
    versions,
    ranked,
    explanations,
  });
  return error ? { ok: false, error: FAILED } : { ok: true };
}
