import { describe, expect, it } from 'vitest';
import {
  buildFieldOccupations,
  buildNeeds,
  buildOccupations,
  dropToHeader,
  missingOpenCodes,
  parseGrowth,
  parseTsv,
  parseWages,
  rollUpCip,
  socOf,
} from './reference';

const occupationData = parseTsv(
  [
    'O*NET-SOC Code\tTitle\tDescription',
    '11-1011.00\tChief Executives\tRun companies.',
    '13-1082.00\tProject Management Specialists\tAnalyze and coordinate projects.',
    '15-2051.01\tBusiness Intelligence Analysts\tProduce financial and market intelligence.',
    '35-2014.00\tCooks, Restaurant\tCook food.',
    '25-1123.00\tEnglish Language and Literature Teachers, Postsecondary\tTeach English.',
  ].join('\n')
);

const jobZones = parseTsv(
  [
    'O*NET-SOC Code\tJob Zone\tDate\tDomain Source',
    '11-1011.00\t5\t08/2023\tAnalyst',
    '13-1082.00\t4\t08/2023\tAnalyst',
    '15-2051.01\t4\t08/2023\tAnalyst',
    '35-2014.00\t2\t08/2023\tAnalyst',
    '25-1123.00\t5\t08/2023\tAnalyst',
  ].join('\n')
);

const excluded = { codes: ['11-1011.00'], prefixes: ['25-1'] };

describe('small helpers', () => {
  it('reads tab-separated text with a header row', () => {
    expect(parseTsv('A\tB\n1\t2\n')).toEqual([{ A: '1', B: '2' }]);
  });

  it('drops title lines above the real header', () => {
    expect(dropToHeader('Table 1.2\nNotes\nMatrix code,Percent\n1,2', /matrix code/i)).toBe('Matrix code,Percent\n1,2');
  });

  it('turns O*NET codes into SOC codes and CIP codes into 4-digit series', () => {
    expect(socOf('15-2051.01')).toBe('15-2051');
    expect(rollUpCip('52.0201')).toBe('52.02');
  });
});

describe('parseWages', () => {
  it('keeps detailed occupations with a numeric median, case-insensitive headers', () => {
    const wages = parseWages([
      { OCC_CODE: '13-1082', O_GROUP: 'detailed', A_MEDIAN: '100,750' },
      { OCC_CODE: '11-1011', O_GROUP: 'detailed', A_MEDIAN: '#' },
      { OCC_CODE: '13-0000', O_GROUP: 'major', A_MEDIAN: '80,000' },
    ]);
    expect(wages).toEqual({ '13-1082': 100750 });
    expect(parseWages([{ occ_code: '15-2051', o_group: 'detailed', a_median: '108020' }])).toEqual({ '15-2051': 108020 });
  });
});

describe('parseGrowth', () => {
  it('finds the matrix code and percent change columns by name', () => {
    const growth = parseGrowth([
      { '2024 National Employment Matrix code': '13-1082', 'Employment change, percent, 2024-34': '6.4', 'Occupation type': 'Line item' },
      { '2024 National Employment Matrix code': '13-0000', 'Employment change, percent, 2024-34': '5.0', 'Occupation type': 'Summary' },
      { '2024 National Employment Matrix code': '15-2051', 'Employment change, percent, 2024-34': '-', 'Occupation type': 'Line item' },
    ]);
    expect(growth).toEqual({ '13-1082': 6.4 });
  });
});

describe('buildOccupations', () => {
  it('keeps job zones 3 to 5, drops excluded codes and prefixes, joins pay and growth by SOC', () => {
    const rows = buildOccupations(occupationData, jobZones, { '13-1082': 100750 }, { '13-1082': 6.4 }, excluded);
    expect(rows.map((r) => r.code)).toEqual(['13-1082.00', '15-2051.01']);
    expect(rows[0]).toEqual({
      code: '13-1082.00',
      title: 'Project Management Specialists',
      description: 'Analyze and coordinate projects.',
      jobZone: 4,
      medianWage: 100750,
      growthPct: 6.4,
    });
    expect(rows[1].medianWage).toBeNull();
  });
});

describe('buildFieldOccupations', () => {
  it('rolls CIP up to 4 digits, joins SOC to every O*NET code under it, skips no-match rows, and dedupes', () => {
    const occupations = buildOccupations(occupationData, jobZones, {}, {}, excluded);
    const pairs = buildFieldOccupations(
      [
        { CIP2020Code: '52.0201', SOC2018Code: '13-1082' },
        { CIP2020Code: '52.0203', SOC2018Code: '13-1082' },
        { CIP2020Code: '27.0101', SOC2018Code: '15-2051' },
        { CIP2020Code: '01.0508', SOC2018Code: '99-9999' },
        { CIP2020Code: '52.0201', SOC2018Code: '11-1011' },
      ],
      occupations
    );
    expect(pairs).toEqual([
      { cip: '52.02', code: '13-1082.00' },
      { cip: '27.01', code: '15-2051.01' },
    ]);
  });
});

describe('buildNeeds', () => {
  const styleMap = {
    'Leadership Orientation': { leadership: 1 },
    Dependability: { discipline: 1 },
    'Stress Tolerance': { resilience: 1 },
  };
  const competencies = ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'];

  it('uses positive WI values only, maps them, and normalizes to sum 1', () => {
    const needs = buildNeeds(
      [
        { 'O*NET-SOC Code': '13-1082.00', 'Element Name': 'Leadership Orientation', 'Scale ID': 'WI', 'Data Value': '1.00' },
        { 'O*NET-SOC Code': '13-1082.00', 'Element Name': 'Dependability', 'Scale ID': 'WI', 'Data Value': '3.00' },
        { 'O*NET-SOC Code': '13-1082.00', 'Element Name': 'Stress Tolerance', 'Scale ID': 'WI', 'Data Value': '-1.00' },
        { 'O*NET-SOC Code': '13-1082.00', 'Element Name': 'Dependability', 'Scale ID': 'DR', 'Data Value': '9.00' },
      ],
      styleMap,
      competencies,
      ['13-1082.00']
    );
    expect(needs['13-1082.00']).toEqual({
      leadership: 0.25,
      discipline: 0.75,
      resilience: 0,
      adaptability: 0,
      communication: 0,
      execution: 0,
    });
  });

  it('spreads needs evenly when an occupation has no positive work styles', () => {
    const needs = buildNeeds([], styleMap, competencies, ['15-2051.01']);
    expect(needs['15-2051.01'].leadership).toBeCloseTo(1 / 6, 4);
  });

  it('throws on a work style missing from the style map, so a new O*NET release is noticed', () => {
    expect(() =>
      buildNeeds(
        [{ 'O*NET-SOC Code': '13-1082.00', 'Element Name': 'Grit', 'Scale ID': 'WI', 'Data Value': '1.00' }],
        styleMap,
        competencies,
        ['13-1082.00']
      )
    ).toThrow('Grit');
  });
});

describe('missingOpenCodes', () => {
  it('lists open-list codes that are not candidate occupations', () => {
    const occupations = buildOccupations(occupationData, jobZones, {}, {}, excluded);
    expect(missingOpenCodes([{ code: '13-1082.00' }, { code: '99-9999.00' }], occupations)).toEqual(['99-9999.00']);
  });
});
