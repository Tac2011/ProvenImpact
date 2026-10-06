import Link from 'next/link';
import { notFound } from 'next/navigation';
import { competencyLabel, getRubricCompetencies } from '@/lib/rubric';
import type { ExperienceStatus, Followup, Strength } from '@/lib/experiences';
import { requireExperiencesAccess } from '../access';
import { FollowupForm } from './FollowupForm';
import { ResultCard, type EvidenceView } from './ResultCard';
import { DeleteExperience } from './DeleteExperience';
import { RetryPanel } from './RetryPanel';

// Continue and Try again run server actions that can make two Claude calls.
export const maxDuration = 60;

interface DetailRow {
  id: string;
  title: string;
  status: ExperienceStatus;
  followups: Followup[];
  rubric_version_id: string | null;
  resume_bullet: string | null;
  interview_line: string | null;
  experience_evidence: {
    id: string;
    competency_key: string;
    strength: Strength;
    quote: string;
    reason: string;
    included: boolean;
  }[];
}

export default async function ExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireExperiencesAccess();

  const { data } = await supabase
    .from('experiences')
    .select(
      'id, title, status, followups, rubric_version_id, resume_bullet, interview_line, experience_evidence(id, competency_key, strength, quote, reason, included)'
    )
    .eq('id', id)
    .eq('athlete_id', user.id)
    .maybeSingle();

  if (!data) {
    notFound();
  }
  const experience = data as DetailRow;

  // Labels come from the rubric version this experience was scored against.
  const competencies = experience.rubric_version_id
    ? await getRubricCompetencies(supabase, experience.rubric_version_id)
    : [];

  const evidence: EvidenceView[] = experience.experience_evidence
    .map((item) => ({
      id: item.id,
      label: competencyLabel(item.competency_key, competencies),
      definition: competencies.find((c) => c.key === item.competency_key)?.definition ?? '',
      strength: item.strength,
      quote: item.quote,
      reason: item.reason,
      included: item.included,
    }))
    .sort(
      (a, b) =>
        Number(b.strength === 'strong') - Number(a.strength === 'strong') ||
        a.label.localeCompare(b.label)
    );

  const status = experience.status;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/experiences" className="text-sm text-gray-500 hover:underline">
        &larr; My Experiences
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{experience.title}</h1>

      {status === 'needs_followup' && (
        <FollowupForm
          experienceId={experience.id}
          questions={experience.followups.map((f) => f.question)}
        />
      )}

      {(status === 'draft' || status === 'failed') && (
        <RetryPanel experienceId={experience.id} failed={status === 'failed'} />
      )}

      {(status === 'mapped' || status === 'confirmed') && (
        <ResultCard
          experienceId={experience.id}
          confirmed={status === 'confirmed'}
          evidence={evidence}
          resumeBullet={experience.resume_bullet ?? ''}
          interviewLine={experience.interview_line ?? ''}
        />
      )}

      <DeleteExperience experienceId={experience.id} />
    </main>
  );
}
