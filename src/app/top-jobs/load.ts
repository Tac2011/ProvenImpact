import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPETENCIES } from '@/lib/competencies';
import { fieldsFromEducation, type EvidenceItem, type RankedJob, type StudentField } from '@/lib/topJobs/score';
import { fingerprint, type InputsSummary, type Versions } from '@/lib/topJobs/fingerprint';
import type { Material, SavedExplanation } from '@/lib/topJobs/explain';

export interface StudentInputs {
  hasProfile: boolean;
  assessmentComplete: boolean;
  sport: string;
  positions: string[];
  disciplines: string[];
  fields: StudentField[];
  selfScores: Record<string, number>;
  evidence: EvidenceItem[];
  experienceCount: number;
  inProgressCount: number;
  fingerprintExperiences: { id: string; updatedAt: string; evidence: { competencyKey: string; strength: string }[] }[];
  material: Material;
  bioImportId: string | null;
}

export interface SavedResult {
  id: string;
  created_at: string;
  fingerprint: string;
  inputs_summary: InputsSummary;
  versions: Versions;
  ranked: RankedJob[];
  explanations: Record<string, SavedExplanation>;
}

interface ExperienceRow {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  experience_evidence: { competency_key: string; strength: 'strong' | 'moderate'; quote: string; included: boolean }[];
}

const COUNTED = ['mapped', 'confirmed'];

export async function loadStudentInputs(supabase: SupabaseClient, userId: string): Promise<StudentInputs> {
  const [profileResult, scoresResult, educationResult, experiencesResult, honorsResult, bioResult] = await Promise.all([
    supabase.from('profiles').select('sport, positions, disciplines').eq('id', userId).maybeSingle(),
    supabase.from('competency_scores').select('competency_key, score').eq('athlete_id', userId),
    supabase.from('athlete_education').select('is_current, primary_field_code, secondary_field_code').eq('athlete_id', userId),
    supabase
      .from('experiences')
      .select('id, title, status, updated_at, experience_evidence(competency_key, strength, quote, included)')
      .eq('athlete_id', userId),
    supabase.from('athlete_honors').select('title').eq('athlete_id', userId),
    supabase
      .from('bio_imports')
      .select('id, cleaned_text')
      .eq('athlete_id', userId)
      .not('applied_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const education = (educationResult.data ?? []) as { is_current: boolean; primary_field_code: string | null; secondary_field_code: string | null }[];
  const codes = [...new Set(education.flatMap((r) => [r.primary_field_code, r.secondary_field_code]).filter((c): c is string => !!c))];
  const { data: fieldRows } = codes.length
    ? await supabase.from('fields_of_study').select('code, title').in('code', codes)
    : { data: [] };
  const fieldTitles = Object.fromEntries(((fieldRows ?? []) as { code: string; title: string }[]).map((f) => [f.code, f.title]));

  const experiences = (experiencesResult.data ?? []) as ExperienceRow[];
  const counted = experiences.filter((e) => COUNTED.includes(e.status));
  const scores = (scoresResult.data ?? []) as { competency_key: string; score: number }[];
  const profile = profileResult.data as { sport: string; positions: string[] | null; disciplines: string[] | null } | null;

  return {
    hasProfile: profile !== null,
    assessmentComplete: scores.length >= COMPETENCIES.length,
    sport: profile?.sport ?? '',
    positions: profile?.positions ?? [],
    disciplines: profile?.disciplines ?? [],
    fields: fieldsFromEducation(
      education.map((r) => ({ isCurrent: r.is_current, primaryCode: r.primary_field_code, secondaryCode: r.secondary_field_code })),
      fieldTitles
    ),
    selfScores: Object.fromEntries(scores.map((s) => [s.competency_key, s.score])),
    evidence: counted.flatMap((e) =>
      e.experience_evidence.filter((ev) => ev.included).map((ev) => ({ competencyKey: ev.competency_key, strength: ev.strength }))
    ),
    experienceCount: counted.length,
    inProgressCount: experiences.filter((e) => e.status === 'in_progress').length,
    fingerprintExperiences: counted.map((e) => ({
      id: e.id,
      updatedAt: e.updated_at,
      evidence: e.experience_evidence.filter((ev) => ev.included).map((ev) => ({ competencyKey: ev.competency_key, strength: ev.strength })),
    })),
    material: {
      experiences: counted.map((e) => ({
        id: e.id,
        updatedAt: e.updated_at,
        title: e.title,
        quotes: e.experience_evidence.filter((ev) => ev.included).map((ev) => ev.quote),
      })),
      honors: ((honorsResult.data ?? []) as { title: string }[]).map((h) => h.title),
      bio: (bioResult.data as { cleaned_text: string } | null)?.cleaned_text ?? null,
    },
    bioImportId: (bioResult.data as { id: string } | null)?.id ?? null,
  };
}

export function fingerprintFor(inputs: StudentInputs, versions: Versions): string {
  return fingerprint({
    sport: inputs.sport,
    positions: inputs.positions,
    disciplines: inputs.disciplines,
    fieldCodes: inputs.fields.map((f) => `${f.code}:${f.weight}`),
    selfScores: inputs.selfScores,
    experiences: inputs.fingerprintExperiences,
    honorTitles: inputs.material.honors,
    bioImportId: inputs.bioImportId,
    versions,
  });
}

export function summaryFor(inputs: StudentInputs): InputsSummary {
  return { experiences: inputs.experienceCount, honors: inputs.material.honors.length, hasBio: inputs.bioImportId !== null };
}

export async function loadLatestResults(supabase: SupabaseClient, userId: string, count: number): Promise<SavedResult[]> {
  const { data } = await supabase
    .from('top_job_results')
    .select('id, created_at, fingerprint, inputs_summary, versions, ranked, explanations')
    .eq('athlete_id', userId)
    .order('created_at', { ascending: false })
    .limit(count);
  return (data ?? []) as SavedResult[];
}
