// Runs four test students through top jobs scoring and the real explanation call, and
// writes a report for Todd and Maggi. Reads the newest top jobs tables version, draft
// or published. Signs in as EDUCATION_CHECK_A (in .env.local) to read reference data.
// Usage: npm run top-jobs-check -- <report.md>

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requestJobExplanations } from '../src/lib/claude';
import { TOP_COUNT } from '../src/lib/topJobs/constants';
import { checkExplanations, type JobToExplain, type Material } from '../src/lib/topJobs/explain';
import { degreeLinkText, earlyNote, rankJobs, type EvidenceItem, type Needs, type StudentField } from '../src/lib/topJobs/score';

const KEYS = ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'];
const LABELS: Record<string, string> = {
  leadership: 'Leadership', discipline: 'Discipline', resilience: 'Resilience',
  adaptability: 'Adaptability', communication: 'Communication', execution: 'Execution',
};

interface TestStudent {
  name: string;
  fields: StudentField[];
  stories: { title: string; quote: string; evidence: EvidenceItem[] }[];
  selfScore: number;
  honors: string[];
  bio: string | null;
}

const story = (title: string, quote: string, ...evidence: [string, 'strong' | 'moderate'][]) => ({
  title,
  quote,
  evidence: evidence.map(([competencyKey, strength]) => ({ competencyKey, strength })),
});

const STUDENTS: TestStudent[] = [
  {
    name: "Cale Jacobsen (previous BBA, current master's, field not given)",
    fields: [{ code: '52.02', title: 'Business Administration, Management and Operations', weight: 0.8 }],
    stories: [
      story('Walk-on decision', 'I turned down scholarships from North Dakota and Holy Cross to walk on at Nebraska', ['resilience', 'strong'], ['execution', 'moderate']),
      story('Scout team year', 'I spent my redshirt year on the scout team running the other team plays every day', ['discipline', 'strong']),
      story('Graduating in three years', 'I graduated in three years while playing Division I basketball', ['discipline', 'strong'], ['execution', 'strong']),
      story('Staying ready off the bench', 'I played double-figure minutes in 34 of 35 games, almost all off the bench', ['adaptability', 'strong'], ['resilience', 'moderate']),
      story('Spain trip', 'I led the team in rebounds, assists and steals on our trip to Spain', ['leadership', 'moderate']),
      story('ACL comeback', 'I tore my ACL in the first game of my junior year and came back to finish with 1,481 career points', ['resilience', 'strong']),
    ],
    selfScore: 4,
    honors: ['Academic All-Big Ten', 'Tom Osborne Citizenship Team', 'Big Ten Distinguished Scholar'],
    bio: null,
  },
  {
    name: 'Charlie Thorne (sophomore, no field of study, 2 experiences)',
    fields: [],
    stories: [
      story('Relay record', 'Our 4x400 relay broke the program record twice and qualified for the NCAA Championships', ['execution', 'strong'], ['communication', 'moderate']),
      story('400 personal best', 'I dropped my 400 to 46.10, the seventh-best mark in school history', ['discipline', 'moderate']),
    ],
    selfScore: 3,
    honors: ['Indoor All-Big 12, 4x400 Meter Relay'],
    bio: null,
  },
  {
    name: 'Business Administration major, Mathematics minor (5 experiences)',
    fields: [
      { code: '52.02', title: 'Business Administration, Management and Operations', weight: 1 },
      { code: '27.01', title: 'Mathematics', weight: 0.6 },
    ],
    stories: [
      story('Stats for the coaching staff', 'I built a spreadsheet that tracked our shot data and the coaches used it in film sessions', ['execution', 'strong'], ['discipline', 'moderate']),
      story('Captain', 'I was voted captain my junior year and ran our team meetings', ['leadership', 'strong'], ['communication', 'moderate']),
      story('Early morning lifts', 'I lifted at 6 a.m. four days a week for three seasons', ['discipline', 'strong']),
      story('Position change', 'I switched from point guard to wing in two weeks when we lost a starter', ['adaptability', 'strong']),
      story('Academic honors', 'I kept a 3.8 GPA while traveling every weekend', ['discipline', 'strong'], ['execution', 'moderate']),
    ],
    selfScore: 4,
    honors: ['Academic All-Conference'],
    bio: null,
  },
  {
    name: 'English major, Russian Literature minor (6 experiences, strong leadership and execution)',
    fields: [
      { code: '23.01', title: 'English Language and Literature, General', weight: 1 },
      { code: '16.04', title: 'Slavic, Baltic and Albanian Languages, Literatures, and Linguistics', weight: 0.6 },
    ],
    stories: [
      story('Team travel planner', 'I organized travel for 30 teammates for every away meet for two seasons', ['execution', 'strong'], ['leadership', 'moderate']),
      story('Captain', 'I was elected captain twice and ran our goal-setting meetings', ['leadership', 'strong']),
      story('Recovering from injury', 'I broke my wrist and kept training with a cast for eight weeks', ['resilience', 'strong']),
      story('Mentoring freshmen', 'I paired every freshman with an upperclassman and checked in weekly', ['leadership', 'strong'], ['communication', 'strong']),
      story('Fundraiser', 'I led a fundraiser that raised $12,000 for new equipment', ['execution', 'strong'], ['communication', 'moderate']),
      story('Balancing two jobs', 'I worked two campus jobs while competing and never missed a practice', ['discipline', 'strong']),
    ],
    selfScore: 4,
    honors: [],
    bio: null,
  },
];

async function main() {
  const output = process.argv[2];
  if (!output) {
    console.error('Usage: npm run top-jobs-check -- <report.md>');
    process.exit(1);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.EDUCATION_CHECK_A_EMAIL!,
    password: process.env.EDUCATION_CHECK_A_PASSWORD!,
  });
  if (signInError) {
    console.error(`Could not sign in: ${signInError.message}`);
    process.exit(1);
  }

  const { data: tables } = await supabase
    .from('top_jobs_tables')
    .select('id, version, self_map, open_list')
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (!tables) {
    console.error('No top jobs tables loaded. Run the data SQL first.');
    process.exit(1);
  }
  const openList = (tables.open_list as { code: string }[]).map((item) => item.code);
  const selfMap = tables.self_map as Record<string, Record<string, number>>;

  const [needsResult, occupationsResult, linksResult] = await Promise.all([
    supabase.from('occupation_needs').select('occupation_code, needs').eq('tables_id', tables.id),
    supabase.from('occupations').select('code, title, description'),
    supabase.from('field_occupations').select('cip_code, occupation_code').in('cip_code', ['52.02', '27.01', '23.01', '16.04']),
  ]);
  const needs = Object.fromEntries(((needsResult.data ?? []) as { occupation_code: string; needs: Needs }[]).map((n) => [n.occupation_code, n.needs]));
  const occupations = new Map(((occupationsResult.data ?? []) as { code: string; title: string; description: string }[]).map((o) => [o.code, o]));
  const fieldOccupations: Record<string, string[]> = {};
  for (const link of (linksResult.data ?? []) as { cip_code: string; occupation_code: string }[]) {
    (fieldOccupations[link.cip_code] ??= []).push(link.occupation_code);
  }
  const titles = Object.fromEntries([...occupations].map(([code, o]) => [code, o.title]));

  const lines = ['# Top Jobs Check', '', `Run ${new Date().toISOString().slice(0, 10)} with top jobs tables v${tables.version}.`, ''];
  for (const student of STUDENTS) {
    console.log(`Scoring ${student.name}...`);
    const selfScores = Object.fromEntries(Object.keys(selfMap).map((key) => [key, student.selfScore]));
    const ranked = rankJobs({
      competencies: KEYS,
      evidence: student.stories.flatMap((s) => s.evidence),
      experienceCount: student.stories.length,
      selfScores,
      selfMap,
      fields: student.fields,
      fieldOccupations,
      openList,
      needs,
      titles,
    });
    const top = ranked.slice(0, TOP_COUNT);
    const material: Material = {
      experiences: student.stories.map((s, i) => ({ id: `s${i + 1}`, updatedAt: 'n/a', title: s.title, quotes: [s.quote] })),
      honors: student.honors,
      bio: student.bio,
    };
    const jobs: JobToExplain[] = top.map((job) => ({
      code: job.code,
      title: titles[job.code],
      description: occupations.get(job.code)?.description ?? '',
      needs: Object.entries(needs[job.code] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => LABELS[k]),
    }));
    const raw = await requestJobExplanations(jobs, material);
    const explained = raw === null ? {} : checkExplanations(raw, jobs, material);

    lines.push(`## ${student.name}`, '');
    const note = earlyNote(top, { hasCodedField: student.fields.length > 0, experienceCount: student.stories.length, inProgressCount: 0 });
    if (note) lines.push(`> ${note}`, '');
    lines.push('| # | Job | Score | Level | Strengths | Degree |', '|---|---|---|---|---|---|');
    top.forEach((job, i) => {
      lines.push(`| ${i + 1} | ${titles[job.code]} | ${job.score} | ${job.level} | ${job.tags.map((t) => LABELS[t]).join(', ')} | ${degreeLinkText(job.linkedFields)} |`);
    });
    lines.push('', '**Why you:**', '');
    top.forEach((job, i) => lines.push(`${i + 1}. ${explained[job.code]?.why ?? '_(no explanation; card would show the fallback)_'}`));
    lines.push('');
  }
  writeFileSync(output, lines.join('\n'));
  console.log(`Wrote ${output}.`);
}

main();
