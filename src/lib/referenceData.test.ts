import { describe, expect, it } from 'vitest';
import {
  buildColleges,
  buildFieldsOfStudy,
  parseCsv,
  splitAliases,
  toSql,
  type CollegeRow,
  type FieldRow,
  type SourceRow,
} from './referenceData';

describe('parseCsv', () => {
  it('reads a header row and quoted fields with commas and doubled quotes', () => {
    const rows = parseCsv(
      '\uFEFFUNITID,INSTNM,CITY\r\n1,"Saint Mary\'s College, Omaha","Say ""Hi"""\r\n'
    );
    expect(rows).toEqual([
      { UNITID: '1', INSTNM: "Saint Mary's College, Omaha", CITY: 'Say "Hi"' },
    ]);
  });

  it('keeps newlines inside quoted fields and skips blank lines', () => {
    const rows = parseCsv('A,B\n"line one\nline two",x\n\n');
    expect(rows).toEqual([{ A: 'line one\nline two', B: 'x' }]);
  });

  it('reads Excel-style ="..." cells as the text with a leading =', () => {
    const rows = parseCsv('CIPCode,CIPTitle\n="11.07","Computer Science."\n');
    expect(rows[0].CIPCode).toBe('=11.07');
  });
});

describe('splitAliases', () => {
  it('splits on | and on runs of two or more spaces, dropping blanks', () => {
    expect(splitAliases('UNK|University of Nebraska - Kearney|Nebraska Kearney|')).toEqual([
      'UNK',
      'University of Nebraska - Kearney',
      'Nebraska Kearney',
    ]);
    expect(splitAliases('Concordia Teachers College  Concordia College')).toEqual([
      'Concordia Teachers College',
      'Concordia College',
    ]);
    expect(splitAliases(' ')).toEqual([]);
  });
});

const HD = parseCsv(
  [
    'UNITID,INSTNM,IALIAS,CITY,STABBR',
    '181394,University of Nebraska at Omaha,UNOMAHA,Omaha,NE',
    '153630,Iowa Western Community College, ,Council Bluffs,IA',
    '999001,Beauty School of Lincoln, ,Lincoln,NE',
    '100654,Alabama A & M University,AAMU,Normal,AL',
  ].join('\n')
);

const IC = parseCsv(
  [
    'UNITID,ATHASSOC,ASSOC1,ASSOC2,ASSOC3,ASSOC4,ASSOC5,ASSOC6',
    '181394,1,1,2,2,2,2,2',
    '153630,1,2,2,1,2,2,2',
    '999001,2,-2,-2,-2,-2,-2,-2',
    '100654,1,1,2,2,2,2,2',
  ].join('\n')
);

describe('buildColleges', () => {
  const colleges = buildColleges(HD, IC, ['NE', 'KS', 'IA', 'ND', 'SD'], {
    '181394': ['UNO', 'unomaha', 'Omaha'],
  });

  it('keeps only schools in the given states with an athletic association', () => {
    expect(colleges.map((c) => c.id)).toEqual([153630, 181394]);
  });

  it('sorts by state, then name', () => {
    expect(colleges.map((c) => c.state)).toEqual(['IA', 'NE']);
  });

  it('maps ASSOC1 to ASSOC6 to association names', () => {
    expect(colleges.find((c) => c.id === 181394)?.athleticAssociations).toEqual(['NCAA']);
    expect(colleges.find((c) => c.id === 153630)?.athleticAssociations).toEqual(['NJCAA']);
  });

  it('merges federal aliases with hand-kept nicknames, ignoring case duplicates', () => {
    expect(colleges.find((c) => c.id === 181394)?.nicknames).toEqual(['UNOMAHA', 'UNO', 'Omaha']);
    expect(colleges.find((c) => c.id === 153630)?.nicknames).toEqual([]);
  });
});

describe('buildFieldsOfStudy', () => {
  const cip = parseCsv(
    [
      'CIPFamily,CIPCode,Action,CIPTitle',
      '="11",="11","No substantive changes","COMPUTER AND INFORMATION SCIENCES."',
      '="11",="11.07","No substantive changes","Computer Science."',
      '="11",="11.0701","No substantive changes","Computer Science."',
      '="52",="52.03","New","Accounting and Related Services."',
      '="32",="32.01","No substantive changes","Basic Skills and Developmental/Remedial Education, General."',
      '="60",="60.01","No substantive changes","Dental Residency/Fellowship Programs."',
      '="13",="13.99","Deleted","Old Education Code."',
      '="13",="13.98","Moved to","Moved Education Code."',
    ].join('\n')
  );
  const fields = buildFieldsOfStudy(cip);

  it('keeps only 4-digit codes outside excluded families, minus deleted and moved codes', () => {
    expect(fields.map((f) => f.code)).toEqual(['11.07', '52.03']);
  });

  it('strips the = wrapper and the trailing period, and records the family', () => {
    expect(fields[0]).toEqual({ code: '11.07', title: 'Computer Science', familyCode: '11' });
  });
});

describe('toSql', () => {
  const sources: SourceRow[] = [
    {
      id: 'ipeds-2024',
      publisher: 'NCES, U.S. Department of Education',
      dataset: "IPEDS Directory (HD2024)",
      edition: '2024-25 collection',
      url: 'https://example.gov/HD2024.zip',
      retrievedOn: '2026-10-12',
      checksum: 'abc',
      notes: "Schools' data",
    },
  ];
  const colleges: CollegeRow[] = [
    {
      id: 1,
      name: "Saint Mary's College",
      city: 'Omaha',
      state: 'NE',
      athleticAssociations: ['NAIA', 'NCCAA'],
      nicknames: [],
    },
  ];
  const fields: FieldRow[] = [{ code: '11.07', title: 'Computer Science', familyCode: '11' }];
  const sql = toSql({
    sources,
    colleges,
    fields,
    collegeSourceId: 'ipeds-2024',
    fieldSourceId: 'cip-2020',
    header: '-- test header',
  });

  it('escapes single quotes', () => {
    expect(sql).toContain("'Saint Mary''s College'");
    expect(sql).toContain("'Schools'' data'");
  });

  it('writes arrays and empty arrays as text[]', () => {
    expect(sql).toContain("array['NAIA', 'NCCAA']::text[]");
    expect(sql).toContain("'{}'::text[]");
  });

  it('upserts so it can be re-run', () => {
    expect(sql).toContain('on conflict (id) do update set');
    expect(sql).toContain('on conflict (code) do update set');
  });

  it('starts with the header and inserts sources before the lists that point to them', () => {
    expect(sql.startsWith('-- test header')).toBe(true);
    expect(sql.indexOf('insert into data_sources')).toBeLessThan(sql.indexOf('insert into colleges'));
    expect(sql).toContain("'11.07', 'Computer Science', '11', 'cip-2020'");
  });
});
