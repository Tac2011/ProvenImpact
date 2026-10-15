'use server';

import { createClient } from '@/lib/supabase/server';
import { checkAndLogRun } from '@/lib/aiRuns';
import { requestBioReading } from '@/lib/claude';
import { checkBioOutput, checkPaste, cleanHonors, type CheckedBio } from '@/lib/bioImport';
import { collegeOptions, fieldOptions } from '@/lib/pickerSearch';
import type { College, FieldOfStudy } from '@/lib/education';

export type ReadBioResult = { ok: true; importId: string; bio: CheckedBio } | { ok: false; error: string };
export type ApplyBioResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = 'Please log in again.';
const EMPTY_PASTE = 'Paste your bio first.';
const TOO_LONG = "That's longer than a bio. Paste up to 15,000 characters.";
const COULD_NOT_READ = "We couldn't read your bio. Try again, or fill in your profile yourself.";
const NOTHING_FOUND = "We didn't find profile details in that text. Check that you pasted your athlete bio.";
const APPLY_FAILED =
  "Your profile was saved, but we couldn't add your honors and story ideas. Click Save again to retry.";

// Central time, matching the profile page's year menus.
function thisYear(): number {
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Chicago' }).format(new Date()));
}

export async function readBio(input: unknown): Promise<ReadBioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SIGNED_OUT };
  }

  const paste = checkPaste(input);
  if (!paste.ok) {
    return { ok: false, error: paste.error === 'empty' ? EMPTY_PASTE : TOO_LONG };
  }

  // Loaded before the run is logged, so a load failure doesn't use up a try.
  const [collegesResult, fieldsResult, ideasResult, honorsResult] = await Promise.all([
    supabase.from('colleges').select('id, name, city, state, nicknames'),
    supabase.from('fields_of_study').select('code, title'),
    supabase.from('story_ideas').select('prompt').eq('athlete_id', user.id),
    supabase.from('athlete_honors').select('title').eq('athlete_id', user.id),
  ]);
  if (collegesResult.error || fieldsResult.error || ideasResult.error || honorsResult.error) {
    return { ok: false, error: COULD_NOT_READ };
  }

  const run = await checkAndLogRun(supabase, user.id);
  if (!run.ok) {
    return run;
  }

  const earlierIdeas = (ideasResult.data ?? []).map((row) => row.prompt as string);
  const raw = await requestBioReading(paste.text, earlierIdeas);
  if (raw === null) {
    return { ok: false, error: COULD_NOT_READ };
  }

  const checked = checkBioOutput(raw, {
    colleges: collegeOptions((collegesResult.data ?? []) as College[]),
    fields: fieldOptions((fieldsResult.data ?? []) as FieldOfStudy[]),
    thisYear: thisYear(),
    earlierIdeas,
    existingHonors: (honorsResult.data ?? []).map((row) => row.title as string),
    pastedLength: paste.text.length,
  });
  if (!checked.ok) {
    return { ok: false, error: checked.reason === 'empty' ? NOTHING_FOUND : COULD_NOT_READ };
  }

  const { data, error } = await supabase
    .from('bio_imports')
    .insert({ athlete_id: user.id, cleaned_text: checked.cleanedText, extracted: checked.bio })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: COULD_NOT_READ };
  }
  return { ok: true, importId: data.id, bio: checked.bio };
}

// Runs after the profile saves. apply_bio_import does the rest in one transaction: it
// adds the kept honors and the stored import's story ideas (never ideas from the
// browser) and marks the import applied, or changes nothing, so Save can retry.
export async function applyBioImport(importId: unknown, keptHonors: unknown): Promise<ApplyBioResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SIGNED_OUT };
  }
  if (typeof importId !== 'string') {
    return { ok: false, error: APPLY_FAILED };
  }

  const { data: existing, error: existingError } = await supabase
    .from('athlete_honors')
    .select('title')
    .eq('athlete_id', user.id);
  if (existingError) {
    return { ok: false, error: APPLY_FAILED };
  }

  // Kept honors come from the browser, so they're cleaned again and checked against the saved list.
  const honors = cleanHonors(
    Array.isArray(keptHonors) ? keptHonors : [],
    (existing ?? []).map((h) => h.title as string)
  );

  const { error } = await supabase.rpc('apply_bio_import', { import_id: importId, honors });
  if (error) {
    console.error('applyBioImport failed', error.message);
    return { ok: false, error: APPLY_FAILED };
  }
  return { ok: true };
}
