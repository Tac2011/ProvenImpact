// Turns the approved rubric draft (markdown) into draft rubric SQL.
// Usage: npm run build-rubric-sql -- <version> <draft.md> <out.sql> "<notes>"

import { readFileSync, writeFileSync } from 'node:fs';
import { parseRubricDraft, rubricSql } from '../src/lib/rubricDraft';

const [version, draftPath, outPath, notes] = process.argv.slice(2);
if (!version || !draftPath || !outPath || !notes) {
  console.error('Usage: npm run build-rubric-sql -- <version> <draft.md> <out.sql> "<notes>"');
  process.exit(1);
}
const competencies = parseRubricDraft(readFileSync(draftPath, 'utf8'));
writeFileSync(outPath, rubricSql(Number(version), notes, competencies));
console.log(`Wrote ${outPath}: ${competencies.map((c) => `${c.label} (${c.examples.length} examples)`).join(', ')}.`);
