// Runs athlete bios through the real bio reading and checks, and writes a report for
// Todd to review: what fills the profile, what didn't match, honors, story ideas, and the
// cleaned bio, flagging any sentence about family or birthdates that survived cleaning.
// Bios in the input file are separated by a line of 10 or more dashes. Signs in as the
// EDUCATION_CHECK_A account (in .env.local) to read the school and field lists.
// Usage: npm run bio-check -- <bios.txt> <report.md>

import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requestBioReading } from '../src/lib/claude';
import {
  checkBioOutput,
  honorLine,
  possibleFamilyDetails,
  schoolSummary,
  type BioSchool,
} from '../src/lib/bioImport';
import { collegeOptions, fieldOptions } from '../src/lib/pickerSearch';
import type { College, FieldOfStudy } from '../src/lib/education';

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: npm run bio-check -- <bios.txt> <report.md>');
    process.exit(1);
  }

  const email = process.env.EDUCATION_CHECK_A_EMAIL;
  const password = process.env.EDUCATION_CHECK_A_PASSWORD;
  if (!email || !password) {
    console.error('Set EDUCATION_CHECK_A_EMAIL and EDUCATION_CHECK_A_PASSWORD in .env.local.');
    process.exit(1);
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error(`Could not sign in as ${email}: ${signInError.message}`);
    process.exit(1);
  }

  const [collegesResult, fieldsResult] = await Promise.all([
    supabase.from('colleges').select('id, name, city, state, nicknames'),
    supabase.from('fields_of_study').select('code, title'),
  ]);
  if (collegesResult.error || fieldsResult.error) {
    console.error('Could not load the school and field lists.');
    process.exit(1);
  }
  const colleges = collegeOptions(collegesResult.data as College[]);
  const fields = fieldOptions(fieldsResult.data as FieldOfStudy[]);
  const thisYear = new Date().getFullYear();

  const bios = readFileSync(input, 'utf8')
    .split(/^-{10,}\s*$/m)
    .map((bio) => bio.trim())
    .filter(Boolean);

  const lines = ['# Bio Check', '', `Run ${new Date().toISOString().slice(0, 10)} on \`${input}\`.`, ''];
  let toCheck = 0;

  for (const [index, bio] of bios.entries()) {
    console.log(`Reading bio ${index + 1} of ${bios.length}...`);
    const raw = await requestBioReading(bio, []);
    const checked =
      raw === null
        ? null
        : checkBioOutput(raw, {
            colleges,
            fields,
            thisYear,
            earlierIdeas: [],
            existingHonors: [],
            pastedLength: bio.length,
          });

    if (!checked || !checked.ok) {
      lines.push(`## Bio ${index + 1}`, '', `**Failed:** ${checked ? checked.reason : 'the Claude call failed'}`, '');
      toCheck += 1;
      continue;
    }

    const { bio: result, cleanedText } = checked;
    const { profile } = result;
    lines.push(`## Bio ${index + 1}: ${profile.firstName} ${profile.lastName}`.trimEnd(), '');

    lines.push(
      '### Profile',
      '',
      `- Name: ${profile.firstName} ${profile.lastName}`,
      `- Sport: ${profile.sport || `not matched (bio says "${profile.sportText}")`}`,
      `- Positions: ${profile.positions.join(', ') || '-'}`,
      `- Disciplines: ${profile.disciplines.join(', ') || '-'}`,
      ''
    );

    lines.push('### Schools', '');
    const schools = [result.current, ...result.previous].filter((s): s is BioSchool => s !== null);
    if (schools.length === 0) lines.push('- None found');
    for (const school of schools) {
      const notes = [
        school.values.college.id ? '' : 'school not matched',
        school.fieldText && !school.values.primaryField.id ? 'field not matched' : '',
      ].filter(Boolean);
      lines.push(
        `- ${school.isCurrent ? 'Current' : 'Previous'}: ${schoolSummary(school)}${notes.length ? ` (${notes.join(', ')})` : ''}`
      );
    }
    lines.push('');

    lines.push('### Honors', '', ...(result.honors.length ? result.honors.map((h) => `- ${honorLine(h)}`) : ['- None found']), '');
    lines.push(
      '### Story ideas',
      '',
      ...(result.ideas.length ? result.ideas.map((idea, i) => `${i + 1}. ${idea.prompt} _(${idea.source})_`) : ['- None']),
      ''
    );

    const leftovers = possibleFamilyDetails(cleanedText);
    toCheck += leftovers.length;
    lines.push(
      '### Privacy check',
      '',
      ...(leftovers.length
        ? leftovers.map((sentence) => `- **Check:** ${sentence}`)
        : ['- No family or birthdate sentences found in the cleaned bio.']),
      ''
    );

    lines.push('### Cleaned bio', '', ...cleanedText.split(/\r?\n/).map((line) => `> ${line}`), '');
  }

  writeFileSync(output, lines.join('\n'));
  console.log(`Wrote ${output}. ${toCheck} item(s) to check.`);
}

main();
