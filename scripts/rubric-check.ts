// Runs stories through the real mapping and writes a report with the partner's rating next
// to the system's, for her to review. Without a stories file it uses the rubric's own
// example stories. A stories file is markdown like Blind_Rating_Stories.md: a
// "### N. Competency" heading, the story, then "**Rating:" and "**Why:" lines.
// Usage: npm run rubric-check -- <version> <output.md> [stories.md]

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requestMapping } from '../src/lib/claude';
import { athleteTexts, validateMapping, type ExperienceAnswers } from '../src/lib/experiences';
import {
  getRubricByVersion,
  type ExampleRating,
  type Rubric,
  type RubricCompetency,
} from '../src/lib/rubric';

interface Case {
  competency: RubricCompetency;
  story: string;
  rating: ExampleRating;
  why: string;
}

function parseRating(text: string): ExampleRating | null {
  const value = text.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (value === 'strong') return 'strong';
  if (value === 'moderate') return 'moderate';
  if (value === 'not evidence') return 'not_evidence';
  return null;
}

function casesFromRubric(rubric: Rubric): Case[] {
  return rubric.competencies.flatMap((competency) =>
    competency.examples.map((example) => ({
      competency,
      story: example.story,
      rating: example.rating,
      why: example.why ?? '',
    }))
  );
}

function casesFromFile(path: string, rubric: Rubric): Case[] {
  const sections = readFileSync(path, 'utf8').split(/^### \d+\.\s*/m).slice(1);
  return sections.map((section, index) => {
    const [heading, ...lines] = section.split(/\r?\n/);
    const label = heading.trim().toLowerCase();
    const competency = rubric.competencies.find((c) => c.label.toLowerCase() === label);
    const story = lines.find((line) => line.trim() && !line.startsWith('**'))?.trim() ?? '';
    const ratingText = lines.find((line) => line.startsWith('**Rating:'))?.slice(9) ?? '';
    const whyText = lines.find((line) => line.startsWith('**Why:'))?.slice(6) ?? '';
    const rating = parseRating(ratingText);

    if (!competency || !story || !rating) {
      console.error(`Story ${index + 1} ("${heading.trim()}") is missing a competency, story, or rating.`);
      process.exit(1);
    }
    return { competency, story, rating, why: whyText.replace(/\*/g, '').trim() };
  });
}

// validateMapping drops an item whose quote isn't in the story. Find what Claude said
// about this competency before that, so a quoting problem isn't read as "Not evidence".
function droppedStrength(raw: unknown, key: string): string | null {
  const evidence = (raw as { evidence?: { competency_key?: string; strength?: string }[] })
    ?.evidence;
  const item = evidence?.find((e) => e.competency_key === key);
  return item?.strength === 'strong' || item?.strength === 'moderate' ? item.strength : null;
}

const RATING_LABELS: Record<ExampleRating, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  not_evidence: 'Not evidence',
};

// An example is a single story, so it goes in "What did you do?" and the rest stay blank.
function storyAsAnswers(story: string): ExperienceAnswers {
  return { title: '', what_you_did: story, frequency: '', result: '', obstacle: '' };
}

function cell(text: string): string {
  return text.replace(/\|/g, '/').replace(/\n/g, ' ');
}

async function main() {
  const version = Number(process.argv[2]);
  const outputPath = process.argv[3];
  const storiesPath = process.argv[4];
  if (!Number.isInteger(version) || !outputPath) {
    console.error('Usage: npm run rubric-check -- <version> <output.md> [stories.md]');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const rubric = await getRubricByVersion(supabase, version);
  if (!rubric) {
    console.error(`No rubric version ${version} with competencies was found.`);
    process.exit(1);
  }

  const keys = rubric.competencies.map((c) => c.key);
  const cases = storiesPath ? casesFromFile(storiesPath, rubric) : casesFromRubric(rubric);
  const body: string[] = [];
  let agree = 0;
  let heading = '';

  for (const [index, { competency, story, rating, why }] of cases.entries()) {
    if (competency.label !== heading) {
      heading = competency.label;
      body.push(`## ${heading}`, '');
    }
    console.log(`Checking ${competency.label}, story ${index + 1} of ${cases.length}...`);

    const answers = storyAsAnswers(story);
    const raw = await requestMapping(rubric.competencies, answers, []);
    const mapping = raw === null ? null : validateMapping(raw, keys, athleteTexts(answers, []));

    body.push(`**Story ${index + 1}:** ${story}`, '');
    if (!mapping) {
      body.push('**System:** the call failed. Run the check again.', '');
      continue;
    }

    const match = mapping.evidence.find((e) => e.competency_key === competency.key);
    const systemRating: ExampleRating = match ? match.strength : 'not_evidence';
    if (systemRating === rating) {
      agree += 1;
    }

    body.push(
      '| | Rating | Why |',
      '|---|---|---|',
      `| Partner | ${RATING_LABELS[rating]} | ${cell(why)} |`,
      `| System | ${RATING_LABELS[systemRating]} | ${match ? cell(`"${match.quote}" ${match.reason}`) : ''} |`,
      '',
      systemRating === rating ? 'Match.' : '**Different.** Review the rubric wording for this case.',
      ''
    );

    const dropped = match ? null : droppedStrength(raw, competency.key);
    if (dropped) {
      body.push(
        `Note: Claude rated this ${dropped}, but its quote didn't match the story word for word, so the item was dropped. This is a quoting problem, not a rubric problem.`,
        ''
      );
    }

    const others = mapping.evidence.filter((e) => e.competency_key !== competency.key);
    if (others.length > 0) {
      body.push(
        `Also found: ${others.map((e) => `${e.competency_key} (${e.strength})`).join(', ')}`,
        ''
      );
    }
  }

  const source = storiesPath
    ? [
        `Stories from \`${storiesPath.split(/[\\/]/).pop()}\`. These are not in the rubric or the`,
        "prompt, so this is a fair test of how the system reads stories it hasn't seen.",
      ]
    : [
        'The example stories are part of the prompt, so a match here shows the rubric is being',
        'read the way it was meant. Fresh stories the system has never seen are the stronger test.',
      ];
  const header = [
    `# Rubric check: version ${version}`,
    '',
    `Run ${new Date().toLocaleString()} with the live mapping prompt.`,
    '',
    `**Agreement:** ${agree} of ${cases.length} stories.`,
    '',
    ...source,
    '',
  ];

  writeFileSync(outputPath, [...header, ...body].join('\n'));
  console.log(`Wrote ${outputPath}: ${agree} of ${cases.length} stories agree.`);
}

main();
