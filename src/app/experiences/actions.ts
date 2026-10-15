'use server';

import { createClient } from '@/lib/supabase/server';
import { checkAndLogRun } from '@/lib/aiRuns';
import { askFollowupQuestions, requestMapping } from '@/lib/claude';
import { getCurrentRubric, type Rubric } from '@/lib/rubric';
import {
  applyFollowupAnswers,
  athleteTexts,
  keepFollowupQuestions,
  retryDecision,
  validateAnswers,
  validateMapping,
  validatePartialAnswers,
  type AnswerErrors,
  type AnswerKey,
  type ExperienceAnswers,
  type ExperienceStatus,
  type Followup,
} from '@/lib/experiences';

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: AnswerErrors };

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface ExperienceRow extends ExperienceAnswers {
  id: string;
  followups: Followup[];
  status: ExperienceStatus;
  updated_at: string;
}

const EXPERIENCE_COLUMNS =
  'id, title, what_you_did, frequency, result, obstacle, followups, status, updated_at';

const SIGNED_OUT = 'Please log in again.';
const NOT_FOUND = 'We could not find that experience.';
const SAVE_ERROR = 'We could not save that. Please try again.';
const NO_RUBRIC = 'This feature is not available yet.';
const FIX_ANSWERS = 'Please fix the answers marked below.';
const STILL_READING = 'This experience is still being read. Wait a minute, then refresh the page.';
const NOTHING_TO_SAVE = 'Write at least one answer before saving.';
const ALREADY_SUBMITTED = 'This experience was already submitted. Refresh the page to see it.';

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadExperience(
  supabase: Supabase,
  userId: string,
  id: string
): Promise<ExperienceRow | null> {
  const { data } = await supabase
    .from('experiences')
    .select(EXPERIENCE_COLUMNS)
    .eq('id', id)
    .eq('athlete_id', userId)
    .maybeSingle();
  return (data as ExperienceRow | null) ?? null;
}

// Every action that calls Claude goes through here: it checks the rubric, then the
// shared daily limit (which also logs the run).
async function startRun(
  supabase: Supabase,
  userId: string
): Promise<{ ok: true; rubric: Rubric } | { ok: false; error: string }> {
  const rubric = await getCurrentRubric(supabase);
  if (!rubric) {
    return { ok: false, error: NO_RUBRIC };
  }

  const run = await checkAndLogRun(supabase, userId);
  return run.ok ? { ok: true, rubric } : run;
}

async function saveExperience(
  supabase: Supabase,
  id: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('experiences')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

// Runs the follow-up check (when asked) and then the mapping. The outcome is saved on
// the experience as needs_followup, mapped, or failed, and the experience page shows it.
async function processExperience(
  supabase: Supabase,
  rubric: Rubric,
  experience: ExperienceRow,
  askFollowups: boolean
): Promise<void> {
  const fail = () => saveExperience(supabase, experience.id, { status: 'failed' });

  if (askFollowups) {
    const questions = await askFollowupQuestions(experience);
    if (questions === null) {
      await fail();
      return;
    }
    const followups = keepFollowupQuestions(questions);
    if (followups.length > 0) {
      await saveExperience(supabase, experience.id, { status: 'needs_followup', followups });
      return;
    }
  }

  const raw = await requestMapping(rubric.competencies, experience, experience.followups);
  const mapping =
    raw === null
      ? null
      : validateMapping(
          raw,
          rubric.competencies.map((c) => c.key),
          athleteTexts(experience, experience.followups)
        );
  if (!mapping) {
    await fail();
    return;
  }

  // Replace evidence from any earlier mapping of this experience.
  const { error: deleteError } = await supabase
    .from('experience_evidence')
    .delete()
    .eq('experience_id', experience.id);
  if (deleteError) {
    await fail();
    return;
  }

  if (mapping.evidence.length > 0) {
    const { error: insertError } = await supabase
      .from('experience_evidence')
      .insert(mapping.evidence.map((item) => ({ experience_id: experience.id, ...item })));
    if (insertError) {
      await fail();
      return;
    }
  }

  await saveExperience(supabase, experience.id, {
    status: 'mapped',
    rubric_version_id: rubric.id,
    behaviors: mapping.behaviors,
    resume_bullet: mapping.resume_bullet,
    interview_line: mapping.interview_line,
  });
}

export async function createExperience(
  input: Partial<Record<AnswerKey, unknown>>
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) {
    return { ok: false, error: SIGNED_OUT };
  }

  const checked = validateAnswers(input);
  if (!checked.ok) {
    return { ok: false, error: FIX_ANSWERS, fieldErrors: checked.errors };
  }

  // Checked before saving, so an athlete over the limit keeps their typing on the form.
  const run = await startRun(supabase, userId);
  if (!run.ok) {
    return run;
  }

  const { data, error } = await supabase
    .from('experiences')
    .insert({ athlete_id: userId, ...checked.answers })
    .select(EXPERIENCE_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, error: SAVE_ERROR };
  }

  const experience = data as ExperienceRow;
  await processExperience(supabase, run.rubric, experience, true);
  return { ok: true, id: experience.id };
}

// Saving edits keeps any follow-up answers and goes straight back through mapping.
export async function updateExperience(
  id: string,
  input: Partial<Record<AnswerKey, unknown>>
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) {
    return { ok: false, error: SIGNED_OUT };
  }

  const checked = validateAnswers(input);
  if (!checked.ok) {
    return { ok: false, error: FIX_ANSWERS, fieldErrors: checked.errors };
  }

  const experience = await loadExperience(supabase, userId, id);
  if (!experience) {
    return { ok: false, error: NOT_FOUND };
  }

  const run = await startRun(supabase, userId);
  if (!run.ok) {
    return run;
  }

  if (!(await saveExperience(supabase, id, { ...checked.answers, status: 'draft' }))) {
    return { ok: false, error: SAVE_ERROR };
  }

  // An experience saved to finish later is being submitted for the first time,
  // so it gets the follow-up questions like any new one.
  const askFollowups = experience.status === 'in_progress';
  await processExperience(supabase, run.rubric, { ...experience, ...checked.answers }, askFollowups);
  return { ok: true, id };
}

// Saves what the athlete has typed so far without calling Claude, so it doesn't use a
// daily try. With an id, it only updates an experience that is still in progress.
export async function saveForLater(
  id: string | null,
  input: Partial<Record<AnswerKey, unknown>>
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) {
    return { ok: false, error: SIGNED_OUT };
  }

  const checked = validatePartialAnswers(input);
  if (!checked.ok) {
    return checked.empty
      ? { ok: false, error: NOTHING_TO_SAVE }
      : { ok: false, error: FIX_ANSWERS, fieldErrors: checked.errors };
  }

  if (!id) {
    const { data, error } = await supabase
      .from('experiences')
      .insert({ athlete_id: userId, ...checked.answers, status: 'in_progress' })
      .select('id')
      .single();
    if (error || !data) {
      return { ok: false, error: SAVE_ERROR };
    }
    return { ok: true, id: data.id };
  }

  // The status filter means a second tab that already submitted it can't be overwritten.
  const { data: saved, error } = await supabase
    .from('experiences')
    .update({ ...checked.answers, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('athlete_id', userId)
    .eq('status', 'in_progress')
    .select('id');
  if (error) {
    return { ok: false, error: SAVE_ERROR };
  }
  if (!saved || saved.length === 0) {
    return { ok: false, error: (await loadExperience(supabase, userId, id)) ? ALREADY_SUBMITTED : NOT_FOUND };
  }
  return { ok: true, id };
}

export async function submitFollowups(id: string, answers: unknown[]): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) {
    return { ok: false, error: SIGNED_OUT };
  }

  const experience = await loadExperience(supabase, userId, id);
  if (!experience) {
    return { ok: false, error: NOT_FOUND };
  }
  // Already handled (a double click, or the back button), so there's nothing to do.
  if (experience.status !== 'needs_followup') {
    return { ok: true, id };
  }

  const run = await startRun(supabase, userId);
  if (!run.ok) {
    return run;
  }

  // Save the answers and leave needs_followup in one update. If another request got here
  // first (a reload, then Skip), the update matches no row and this one stops, so it can't
  // overwrite the answers already saved.
  const followups = applyFollowupAnswers(experience.followups, Array.isArray(answers) ? answers : []);
  const { data: claimed, error } = await supabase
    .from('experiences')
    .update({ followups, status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'needs_followup')
    .select('id');
  if (error) {
    return { ok: false, error: SAVE_ERROR };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: true, id };
  }

  await processExperience(supabase, run.rubric, { ...experience, followups }, false);
  return { ok: true, id };
}

export async function retryExperience(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) {
    return { ok: false, error: SIGNED_OUT };
  }

  const experience = await loadExperience(supabase, userId, id);
  if (!experience) {
    return { ok: false, error: NOT_FOUND };
  }
  const decision = retryDecision(experience.status, experience.updated_at, new Date());
  if (decision === 'done') {
    return { ok: true, id };
  }
  if (decision === 'busy') {
    return { ok: false, error: STILL_READING };
  }

  const run = await startRun(supabase, userId);
  if (!run.ok) {
    return run;
  }

  // Claim the experience: only the request that still sees the exact status and
  // updated_at it loaded can move it on, so two clicks never start two runs.
  const { data: claimed, error } = await supabase
    .from('experiences')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', experience.status)
    .eq('updated_at', experience.updated_at)
    .select('id');
  if (error) {
    return { ok: false, error: SAVE_ERROR };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: true, id };
  }

  // Follow-ups are asked only once per experience.
  await processExperience(supabase, run.rubric, experience, experience.followups.length === 0);
  return { ok: true, id };
}
