// Builds the top jobs reference data SQL and the review document for Todd and Maggi.
// Inputs (git-ignored) in reference-downloads/top-jobs/: Occupation Data.txt, Job Zones.txt,
// Work Styles.txt (O*NET 31.0), crosswalk.csv (NCES CIP-SOC sheet), wages.csv (BLS OEWS
// national), projections.csv (BLS Employment Projections table 1.2).
// Writes supabase/reference/top-jobs-data-v1-part1.sql, -part2.sql, and so on.
// Usage: npm run build-top-jobs-data -- <review-doc.md>

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/referenceData';
import {
  buildFieldOccupations,
  buildNeeds,
  contrastNeeds,
  buildOccupations,
  dropToHeader,
  missingOpenCodes,
  parseGrowth,
  parseTsv,
  parseWages,
  type Excluded,
  type StyleMap,
} from '../src/lib/topJobs/reference';
import { COMPETENCIES } from '../src/lib/competencies';

const IN = 'reference-downloads/top-jobs';
const TABLES = 'supabase/reference/top-jobs';
const OUT = 'supabase/reference/top-jobs-data-v1.sql'; // written as -part1, -part2, ...
const BATCH = 100;
const MAX_FILE_CHARS = 90_000;
const RUBRIC_KEYS = ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'];
const TODAY = new Date().toISOString().slice(0, 10);

const read = (name: string) => readFileSync(join(IN, name), 'utf8');
const json = <T>(name: string): T => JSON.parse(readFileSync(join(TABLES, name), 'utf8')) as T;
const sha = (name: string) => createHash('sha256').update(readFileSync(join(IN, name))).digest('hex').slice(0, 16);
const q = (text: string) => `'${text.replace(/'/g, "''")}'`;
const num = (value: number | null) => (value === null ? 'null' : String(value));

function main() {
  const reviewPath = process.argv[2];
  if (!reviewPath) {
    console.error('Usage: npm run build-top-jobs-data -- <review-doc.md>');
    process.exit(1);
  }

  const styleMap = json<StyleMap>('style-map.json');
  const selfMap = json<Record<string, Record<string, number>>>('self-map.json');
  const openList = json<{ code: string; reason: string }[]>('open-list.json');
  const excluded = json<Excluded>('excluded.json');

  const occupations = buildOccupations(
    parseTsv(read('Occupation Data.txt')),
    parseTsv(read('Job Zones.txt')),
    parseWages(parseCsv(read('wages.csv'))),
    parseGrowth(parseCsv(dropToHeader(read('projections.csv'), /matrix code/i))),
    excluded
  );
  const missing = missingOpenCodes(openList, occupations);
  if (missing.length > 0) {
    console.error(`Open-list codes that are not candidate occupations: ${missing.join(', ')}`);
    process.exit(1);
  }
  const pairs = buildFieldOccupations(parseCsv(read('crosswalk.csv')), occupations);
  const needs = contrastNeeds(
    buildNeeds(parseTsv(read('Work Styles.txt')), styleMap, RUBRIC_KEYS, occupations.map((o) => o.code)),
    RUBRIC_KEYS
  );

  const sources = [
    { id: 'onet-31.0', publisher: 'National Center for O*NET Development', dataset: 'O*NET Database', edition: '31.0', url: 'https://www.onetcenter.org/database.html', checksum: sha('Work Styles.txt') },
    { id: 'nces-cip-soc-2020', publisher: 'NCES', dataset: 'CIP 2020 to SOC 2018 Crosswalk', edition: '2020', url: 'https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56', checksum: sha('crosswalk.csv') },
    { id: 'bls-oews-national', publisher: 'U.S. Bureau of Labor Statistics', dataset: 'OEWS National', edition: 'latest at retrieval', url: 'https://www.bls.gov/oes/tables.htm', checksum: sha('wages.csv') },
    { id: 'bls-ep-table-1-2', publisher: 'U.S. Bureau of Labor Statistics', dataset: 'Employment Projections Table 1.2', edition: 'latest at retrieval', url: 'https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm', checksum: sha('projections.csv') },
  ];
  const sourceIds = `array[${sources.map((s) => q(s.id)).join(', ')}]`;

  // Inserts in batches of 100, packed into files of about 90 KB: one 400 KB file failed in
  // the Supabase SQL editor. Every insert skips rows that already exist, so any part can be
  // rerun. Parts must run in order (part 1 has the occupations the others reference).
  const batches = (header: string, rows: string[], conflict: string, action = 'do nothing') => {
    const out: string[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      out.push(`${header}\n${rows.slice(i, i + BATCH).join(',\n')}\non conflict ${conflict} ${action};`);
    }
    return out;
  };

  const statements = [
    ...sources.map(
      (s) =>
        `insert into data_sources (id, publisher, dataset, edition, url, retrieved_on, checksum) values (${q(s.id)}, ${q(s.publisher)}, ${q(s.dataset)}, ${q(s.edition)}, ${q(s.url)}, ${q(TODAY)}, ${q(s.checksum)}) on conflict (id) do nothing;`
    ),
    ...batches(
      'insert into occupations (code, title, description, job_zone, median_wage, growth_pct, source_ids) values',
      occupations.map(
        (o) => `  (${q(o.code)}, ${q(o.title)}, ${q(o.description)}, ${o.jobZone}, ${num(o.medianWage)}, ${num(o.growthPct)}, ${sourceIds})`
      ),
      '(code)'
    ),
    ...batches(
      'insert into field_occupations (cip_code, occupation_code) values',
      pairs.map((p) => `  (${q(p.cip)}, ${q(p.code)})`),
      '(cip_code, occupation_code)'
    ),
    `insert into top_jobs_tables (version, rubric_version_id, self_map, open_list) values (1, (select id from rubric_versions where version = 1), ${q(JSON.stringify(selfMap))}, ${q(JSON.stringify(openList))}) on conflict (version) do update set self_map = excluded.self_map, open_list = excluded.open_list where top_jobs_tables.published_at is null;`,
    ...batches(
      'insert into occupation_needs (tables_id, occupation_code, needs) values',
      occupations.map(
        (o) => `  ((select id from top_jobs_tables where version = 1), ${q(o.code)}, ${q(JSON.stringify(needs[o.code]))})`
      ),
      '(tables_id, occupation_code)',
      // A rerun replaces needs only while the version is a draft, so published results never shift.
      'do update set needs = excluded.needs where occupation_needs.tables_id in (select id from top_jobs_tables where published_at is null)'
    ),
  ];

  const files: string[][] = [[]];
  let size = 0;
  for (const statement of statements) {
    if (size + statement.length > MAX_FILE_CHARS && files[files.length - 1].length > 0) {
      files.push([]);
      size = 0;
    }
    files[files.length - 1].push(statement);
    size += statement.length;
  }
  files.forEach((part, i) => {
    const header = [
      `-- Generated by scripts/build-top-jobs-data.ts. Part ${i + 1} of ${files.length}.`,
      `-- Run all parts in order in the Supabase SQL editor, after 2026-10-15-top-jobs.sql.`,
      '-- Safe to rerun. While tables v1 is a draft, a rerun updates its maps, open list, and job needs;',
      '-- once published, nothing in v1 changes (load changes as version 2). Other rows are skipped.',
    ];
    writeFileSync(OUT.replace('.sql', `-part${i + 1}.sql`), [...header, ...part, ''].join('\n\n'));
  });

  const titles = new Map(occupations.map((o) => [o.code, o.title]));
  const labels = Object.fromEntries(COMPETENCIES.map((c) => [c.key, c.label]));
  const pretty = (map: Record<string, number>) =>
    Object.entries(map)
      .map(([k, w]) => `${k[0].toUpperCase()}${k.slice(1)} ${w}`)
      .join(', ');
  const review = [
    '# Top Jobs Tables v1: for Todd and Maggi to review',
    '',
    `Generated ${TODAY} from O*NET 31.0. Mark up anything to change; edits go back into the JSON files in \`supabase/reference/top-jobs/\`.`,
    '',
    '## 1. What each job needs: O*NET work styles to our six competencies',
    '',
    'O*NET rates how much each work style matters in each job. This table decides which of our competencies each work style counts toward (weight 0 to 1).',
    '',
    '| O*NET work style | Counts toward |',
    '|---|---|',
    ...Object.entries(styleMap).map(([style, map]) => `| ${style} | ${pretty(map)} |`),
    '',
    '## 2. Self-assessment items to our six competencies',
    '',
    '| Self-assessment item | Counts toward |',
    '|---|---|',
    ...Object.entries(selfMap).map(([key, map]) => `| ${labels[key] ?? key} | ${pretty(map)} |`),
    '',
    `## 3. Open to any degree (${openList.length} jobs)`,
    '',
    'Any athlete can match these, whatever their major.',
    '',
    '| Job | Why athletes fit |',
    '|---|---|',
    ...openList.map((item) => `| ${titles.get(item.code)} | ${item.reason} |`),
    '',
    '## 4. Never suggested',
    '',
    ...excluded.codes.map((code) => `- ${code}`),
    ...excluded.prefixes.map((prefix) => `- Every code starting with ${prefix} (postsecondary teachers)`),
    '',
    `Totals: ${occupations.length} candidate occupations, ${pairs.length} field-to-occupation links.`,
    '',
  ].join('\n');
  writeFileSync(reviewPath, review);

  console.log(`Wrote SQL parts next to ${OUT}: ${occupations.length} occupations, ${pairs.length} field links.`);
  console.log(`Wrote ${reviewPath}.`);
}

main();
