import { createClient } from '@/lib/supabase/server';
import {
  buildExperienceReport,
  REPORTED_STATUSES,
  type AthleteExperiences,
  type ReportAthlete,
  type ReportExperienceRow,
  type ReportLabel,
} from '@/lib/reports';

// Returns null when the experiences can't be loaded, so the page can say so.
export async function loadExperienceReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  athletes: ReportAthlete[]
): Promise<AthleteExperiences[] | null> {
  if (athletes.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('experiences')
    .select(
      'id, athlete_id, title, status, created_at, rubric_version_id, experience_evidence(competency_key, strength, included)'
    )
    .in(
      'athlete_id',
      athletes.map((a) => a.id)
    )
    .in('status', REPORTED_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Reports: could not load experiences', error);
    return null;
  }

  const experiences = (data ?? []) as ReportExperienceRow[];
  const versionIds = [
    ...new Set(experiences.map((e) => e.rubric_version_id).filter((id) => id !== null)),
  ];

  // If labels fail to load, competencyLabel falls back to the title-cased key.
  const { data: labelData, error: labelError } =
    versionIds.length > 0
      ? await supabase
          .from('rubric_competencies')
          .select('rubric_version_id, key, label')
          .in('rubric_version_id', versionIds)
      : { data: [], error: null };

  if (labelError) {
    console.error('Reports: could not load competency labels', labelError);
  }

  return buildExperienceReport(athletes, experiences, (labelData ?? []) as ReportLabel[]);
}
