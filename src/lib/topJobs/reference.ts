// Builds the top jobs reference data from O*NET, the NCES CIP-SOC crosswalk, and BLS
// files. Pure, so scripts/build-top-jobs-data.ts stays a thin wrapper.

import { JOB_ZONES } from './constants';

export interface Excluded {
  codes: string[];
  prefixes: string[];
}

export interface OccupationRow {
  code: string;
  title: string;
  description: string;
  jobZone: number;
  medianWage: number | null;
  growthPct: number | null;
}

export type StyleMap = Record<string, Record<string, number>>;

export function parseTsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0);
  const [header, ...rows] = lines;
  if (!header) return [];
  const keys = header.split('\t');
  return rows.map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? '']));
  });
}

// BLS spreadsheets put title lines above the header row.
export function dropToHeader(text: string, headerPattern: RegExp): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headerPattern.test(line));
  return start === -1 ? text : lines.slice(start).join('\n');
}

export function socOf(onetCode: string): string {
  return onetCode.slice(0, 7);
}

export function rollUpCip(code: string): string {
  return code.trim().slice(0, 5);
}

function column(row: Record<string, string>, name: string): string {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name.toLowerCase());
  return key ? row[key].trim() : '';
}

function columnMatching(row: Record<string, string>, ...patterns: RegExp[]): string {
  const key = Object.keys(row).find((k) => patterns.every((p) => p.test(k)));
  return key ? row[key].trim() : '';
}

function toNumber(text: string): number | null {
  const value = Number(text.replace(/[,$\s]/g, ''));
  return text && Number.isFinite(value) ? value : null;
}

// OEWS national file: detailed occupations only; '#' and '*' mean not published.
export function parseWages(rows: Record<string, string>[]): Record<string, number> {
  const wages: Record<string, number> = {};
  for (const row of rows) {
    if (column(row, 'O_GROUP').toLowerCase() !== 'detailed') continue;
    const wage = toNumber(column(row, 'A_MEDIAN'));
    if (wage !== null) wages[column(row, 'OCC_CODE')] = wage;
  }
  return wages;
}

// BLS Employment Projections table 1.2: line items only.
export function parseGrowth(rows: Record<string, string>[]): Record<string, number> {
  const growth: Record<string, number> = {};
  for (const row of rows) {
    const type = columnMatching(row, /occupation type/i);
    if (type && type.toLowerCase() !== 'line item') continue;
    const code = columnMatching(row, /matrix code/i);
    const pct = toNumber(columnMatching(row, /change/i, /percent/i));
    if (code && pct !== null) growth[code] = pct;
  }
  return growth;
}

function isExcluded(code: string, excluded: Excluded): boolean {
  return excluded.codes.includes(code) || excluded.prefixes.some((prefix) => code.startsWith(prefix));
}

export function buildOccupations(
  occupationData: Record<string, string>[],
  jobZones: Record<string, string>[],
  wages: Record<string, number>,
  growth: Record<string, number>,
  excluded: Excluded
): OccupationRow[] {
  const zones = new Map(jobZones.map((row) => [row['O*NET-SOC Code'], Number(row['Job Zone'])]));
  return occupationData
    .map((row) => ({ row, code: row['O*NET-SOC Code'], zone: zones.get(row['O*NET-SOC Code']) ?? 0 }))
    .filter(({ code, zone }) => JOB_ZONES.includes(zone) && !isExcluded(code, excluded))
    .map(({ row, code, zone }) => ({
      code,
      title: row.Title,
      description: row.Description,
      jobZone: zone,
      medianWage: wages[socOf(code)] ?? null,
      growthPct: growth[socOf(code)] ?? null,
    }));
}

export function buildFieldOccupations(
  crosswalk: Record<string, string>[],
  occupations: OccupationRow[]
): { cip: string; code: string }[] {
  const bySoc = new Map<string, string[]>();
  for (const occupation of occupations) {
    const soc = socOf(occupation.code);
    bySoc.set(soc, [...(bySoc.get(soc) ?? []), occupation.code]);
  }
  const seen = new Set<string>();
  const pairs: { cip: string; code: string }[] = [];
  for (const row of crosswalk) {
    const cip = rollUpCip(row.CIP2020Code ?? '');
    for (const code of bySoc.get((row.SOC2018Code ?? '').trim()) ?? []) {
      const key = `${cip}|${code}`;
      if (!cip || seen.has(key)) continue;
      seen.add(key);
      pairs.push({ cip, code });
    }
  }
  return pairs;
}

export function buildNeeds(
  workStyles: Record<string, string>[],
  styleMap: StyleMap,
  competencies: string[],
  codes: string[]
): Record<string, Record<string, number>> {
  const wanted = new Set(codes);
  const raw = new Map<string, Record<string, number>>();
  for (const row of workStyles) {
    if (row['Scale ID'] !== 'WI' || !wanted.has(row['O*NET-SOC Code'])) continue;
    const style = row['Element Name'];
    const map = styleMap[style];
    if (!map) throw new Error(`Work style "${style}" is not in the style map.`);
    const impact = Math.max(0, Number(row['Data Value']) || 0);
    const totals = raw.get(row['O*NET-SOC Code']) ?? {};
    for (const [competency, weight] of Object.entries(map)) {
      totals[competency] = (totals[competency] ?? 0) + impact * weight;
    }
    raw.set(row['O*NET-SOC Code'], totals);
  }

  const needs: Record<string, Record<string, number>> = {};
  for (const code of codes) {
    const totals = raw.get(code) ?? {};
    const sum = competencies.reduce((s, c) => s + (totals[c] ?? 0), 0);
    needs[code] = Object.fromEntries(
      competencies.map((c) => [c, sum > 0 ? round4((totals[c] ?? 0) / sum) : round4(1 / competencies.length)])
    );
  }
  return needs;
}

// O*NET rates most jobs as needing a similar mix of work styles, so raw needs barely
// separate one job from another. Keep only what each job needs more than the average
// job does, renormalized, so a leadership-heavy job and a detail-heavy job look different.
export function contrastNeeds(
  needs: Record<string, Record<string, number>>,
  competencies: string[]
): Record<string, Record<string, number>> {
  const codes = Object.keys(needs);
  const mean = Object.fromEntries(
    competencies.map((c) => [c, codes.reduce((sum, code) => sum + (needs[code][c] ?? 0), 0) / Math.max(codes.length, 1)])
  );
  return Object.fromEntries(
    codes.map((code) => {
      const above = competencies.map((c) => Math.max(0, (needs[code][c] ?? 0) - mean[c]));
      const sum = above.reduce((s, v) => s + v, 0);
      return [
        code,
        Object.fromEntries(
          competencies.map((c, i) => [c, sum > 1e-9 ? round4(above[i] / sum) : round4(1 / competencies.length)])
        ),
      ];
    })
  );
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function missingOpenCodes(openList: { code: string }[], occupations: OccupationRow[]): string[] {
  const codes = new Set(occupations.map((o) => o.code));
  return openList.map((item) => item.code).filter((code) => !codes.has(code));
}
