// Runs each example story in a rubric version through the real mapping and writes a
// report with the partner's rating next to the system's, for her to review.
// Usage: npm run rubric-check -- <version> <output.md>

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requestMapping } from '../src/lib/claude';
import { athleteTexts, validateMapping, type ExperienceAnswers } from '../src/lib/experiences';
import { getRubricByVersion, type ExampleRating } from '../src/lib/rubric';

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
  if (!Number.isInteger(version) || !outputPath) {
    console.error('Usage: npm run rubric-check -- <version> <output.md>');
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
  const body: string[] = [];
  let agree = 0;
  let total = 0;

  for (const competency of rubric.competencies) {
    body.push(`## ${competency.label}`, '');

    for (const example of competency.examples) {
      total += 1;
      console.log(`Checking ${competency.label}, story ${total}...`);

      const answers = storyAsAnswers(example.story);
      const raw = await requestMapping(rubric.competencies, answers, []);
      const mapping = raw === null ? null : validateMapping(raw, keys, athleteTexts(answers, []));

      body.push(`**Story:** ${example.story}`, '');
      if (!mapping) {
        body.push('**System:** the call failed. Run the check again.', '');
        continue;
      }

      const match = mapping.evidence.find((e) => e.competency_key === competency.key);
      const systemRating: ExampleRating = match ? match.strength : 'not_evidence';
      if (systemRating === example.rating) {
        agree += 1;
      }

      body.push(
        '| | Rating | Why |',
        '|---|---|---|',
        `| Partner | ${RATING_LABELS[example.rating]} | ${cell(example.why ?? '')} |`,
        `| System | ${RATING_LABELS[systemRating]} | ${match ? cell(`"${match.quote}" ${match.reason}`) : ''} |`,
        '',
        systemRating === example.rating
          ? 'Match.'
          : '**Different.** Review the rubric wording for this case.',
        ''
      );

      const others = mapping.evidence.filter((e) => e.competency_key !== competency.key);
      if (others.length > 0) {
        body.push(
          `Also found: ${others.map((e) => `${e.competency_key} (${e.strength})`).join(', ')}`,
          ''
        );
      }
    }
  }

  const header = [
    `# Rubric check: version ${version}`,
    '',
    `Run ${new Date().toLocaleString()} with the live mapping prompt.`,
    '',
    `**Agreement:** ${agree} of ${total} stories.`,
    '',
    'The example stories are part of the prompt, so a match here shows the rubric is being',
    'read the way it was meant. Fresh stories the system has never seen are the stronger test.',
    '',
  ];

  writeFileSync(outputPath, [...header, ...body].join('\n'));
  console.log(`Wrote ${outputPath}: ${agree} of ${total} stories agree.`);
}

main();
