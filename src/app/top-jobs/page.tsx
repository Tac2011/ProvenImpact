import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

import { FEW_EXPERIENCES, REFERENCE_VERSION, SCORING_VERSION, TOP_COUNT } from '@/lib/topJobs/constants';
import { basedOnLine, changedLine, inProgressLine, previousResult } from '@/lib/topJobs/fingerprint';
import { degreeLinkText, earlyNote, outlookText, payText } from '@/lib/topJobs/score';
import { getTablesRubric, getTopJobsTables } from '@/lib/topJobs/tables';
import { fingerprintFor, loadLatestResults, loadStudentInputs, summaryFor } from './load';
import { TopJobsView, type CardView } from './TopJobsView';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export default async function TopJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tables = await getTopJobsTables(supabase);
  if (!tables) redirect('/profile');
  const rubric = await getTablesRubric(supabase, tables);

  const inputs = await loadStudentInputs(supabase, user.id);

  if (!inputs.hasProfile || !inputs.assessmentComplete) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">My Top Jobs</h1>
        <p className="mt-4 text-gray-700">Finish your profile and self-assessment to see your top jobs.</p>
        <p className="mt-2 flex gap-4 text-sm">
          <Link href="/profile" className="text-blue-700 underline">My Profile</Link>
          <Link href="/assessment" className="text-blue-700 underline">Self-Assessment</Link>
        </p>
      </main>
    );
  }

  const versions = { rubricVersionId: rubric.id, tablesVersionId: tables.id, reference: REFERENCE_VERSION, scoring: SCORING_VERSION };
  const recent = await loadLatestResults(supabase, user.id, 10);
  const latest = recent[0];
  const previous = previousResult(recent);
  const upToDate = latest?.fingerprint === fingerprintFor(inputs, versions);

  const notes: string[] = [];
  if (!latest) notes.push('The more experiences you add, the better your matches.');
  if (inputs.experienceCount < FEW_EXPERIENCES) {
    notes.push(`You have ${plural(inputs.experienceCount, 'experience')}. Matches will lean on your degree until you add more.`);
  }
  if (inputs.inProgressCount > 0) {
    notes.push(inProgressLine(inputs.inProgressCount));
  }

  let cards: CardView[] = [];
  if (latest) {
    const top = latest.ranked.slice(0, TOP_COUNT);
    const { data } = await supabase
      .from('occupations')
      .select('code, title, description, median_wage, growth_pct')
      .in('code', top.map((job) => job.code));
    const rows = new Map(((data ?? []) as { code: string; title: string; description: string; median_wage: number | null; growth_pct: number | null }[]).map((o) => [o.code, o]));
    const previousTop = new Set((previous?.ranked ?? []).slice(0, TOP_COUNT).map((job) => job.code));
    const label = (key: string) => rubric.competencies.find((c) => c.key === key)?.label ?? key;

    cards = top.map((job) => {
      const row = rows.get(job.code);
      const tagLabels = job.tags.map(label);
      return {
        code: job.code,
        title: row?.title ?? job.code,
        description: row?.description ?? '',
        level: job.level,
        isNew: previous !== undefined && !previousTop.has(job.code),
        pay: payText(row?.median_wage ?? null),
        outlook: outlookText(row?.growth_pct === null || row?.growth_pct === undefined ? null : Number(row.growth_pct)),
        why: latest.explanations[job.code]?.why ?? null,
        fallback: tagLabels.length ? `Fits your strengths in ${tagLabels.join(' and ')}.` : 'Fits your degree and strengths.',
        tags: tagLabels,
        degreeLink: degreeLinkText(job.linkedFields),
      };
    });

    notes.unshift(
      `Your top jobs, ${new Date(latest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}.`,
      basedOnLine(latest.inputs_summary),
      upToDate ? 'Your results are up to date.' : changedLine(latest.inputs_summary, summaryFor(inputs))
    );
    const newCount = cards.filter((card) => card.isNew).length;
    if (newCount > 0) notes.push(`${newCount} new ${newCount === 1 ? 'match' : 'matches'} since your last results.`);
    const early = earlyNote(top, {
      hasCodedField: inputs.fields.length > 0,
      experienceCount: inputs.experienceCount,
      inProgressCount: inputs.inProgressCount,
    });
    if (early) notes.push(early);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">My Top Jobs</h1>
      <TopJobsView
        hasResults={latest !== undefined}
        buttonLabel={!latest ? 'Generate my top 10 jobs' : upToDate ? null : 'Update my results'}
        notes={notes}
        cards={cards}
        missingExplanations={cards.some((card) => card.why === null)}
      />
    </main>
  );
}
