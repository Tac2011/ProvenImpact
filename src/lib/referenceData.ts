// Turns the federal downloads (IPEDS HD and IC, CIP 2020) into the colleges and
// fields of study lists, and the SQL that loads them. Used by
// scripts/build-reference-data.ts; the filters are described in the education spec.

export interface CollegeRow {
  id: number;
  name: string;
  city: string;
  state: string;
  athleticAssociations: string[];
  nicknames: string[];
}

export interface FieldRow {
  code: string;
  title: string;
  familyCode: string;
}

export interface SourceRow {
  id: string;
  publisher: string;
  dataset: string;
  edition: string;
  url: string | null;
  retrievedOn: string;
  checksum: string | null;
  notes: string;
}

const ASSOCIATION_COLUMNS: [string, string][] = [
  ['ASSOC1', 'NCAA'],
  ['ASSOC2', 'NAIA'],
  ['ASSOC3', 'NJCAA'],
  ['ASSOC4', 'NSCAA'],
  ['ASSOC5', 'NCCAA'],
  ['ASSOC6', 'Other'],
];

// Families that aren't college majors: reserved, personal and basic skills,
// high school diplomas, medical residencies.
export const EXCLUDED_CIP_FAMILIES = ['21', '32', '33', '34', '35', '36', '37', '53', '55', '60', '61'];

export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header = [], ...body] = rows;
  const keys = header.map((h) => h.trim());
  return body
    .filter((values) => values.some((v) => v.trim() !== ''))
    .map((values) => Object.fromEntries(keys.map((key, j) => [key, values[j] ?? ''])));
}

export function splitAliases(alias: string): string[] {
  return alias
    .split(/\||\s{2,}/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function uniqueIgnoringCase(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildColleges(
  hd: Record<string, string>[],
  ic: Record<string, string>[],
  states: string[],
  extraNicknames: Record<string, string[]>
): CollegeRow[] {
  const icById = new Map(ic.map((r) => [r.UNITID, r]));

  return hd
    .filter((r) => states.includes(r.STABBR) && icById.get(r.UNITID)?.ATHASSOC === '1')
    .map((r) => {
      const icRow = icById.get(r.UNITID)!;
      return {
        id: Number(r.UNITID),
        name: r.INSTNM.trim(),
        city: r.CITY.trim(),
        state: r.STABBR,
        athleticAssociations: ASSOCIATION_COLUMNS.filter(([col]) => icRow[col] === '1').map(
          ([, name]) => name
        ),
        nicknames: uniqueIgnoringCase([
          ...splitAliases(r.IALIAS ?? ''),
          ...(extraNicknames[r.UNITID] ?? []),
        ]),
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
}

// CIP cells come wrapped as ="11.07" so Excel keeps the leading zero.
function cleanCipCode(value: string): string {
  return value.replace(/^=?"?/, '').replace(/"$/, '').trim();
}

export function buildFieldsOfStudy(cip: Record<string, string>[]): FieldRow[] {
  return cip
    .map((r) => ({ code: cleanCipCode(r.CIPCode), action: r.Action, title: r.CIPTitle }))
    .filter(
      (r) =>
        /^\d\d\.\d\d$/.test(r.code) &&
        !EXCLUDED_CIP_FAMILIES.includes(r.code.slice(0, 2)) &&
        r.action !== 'Deleted' &&
        r.action !== 'Moved to'
    )
    .map((r) => ({
      code: r.code,
      title: r.title.trim().replace(/\.$/, ''),
      familyCode: r.code.slice(0, 2),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function text(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/'/g, "''")}'`;
}

function textArray(values: string[]): string {
  return values.length === 0 ? "'{}'::text[]" : `array[${values.map(text).join(', ')}]::text[]`;
}

export function toSql(input: {
  sources: SourceRow[];
  colleges: CollegeRow[];
  fields: FieldRow[];
  collegeSourceId: string;
  fieldSourceId: string;
  header: string;
}): string {
  const sourceValues = input.sources.map(
    (s) =>
      `  (${text(s.id)}, ${text(s.publisher)}, ${text(s.dataset)}, ${text(s.edition)}, ${text(s.url)}, ${text(s.retrievedOn)}, ${text(s.checksum)}, ${text(s.notes)})`
  );
  const collegeValues = input.colleges.map(
    (c) =>
      `  (${c.id}, ${text(c.name)}, ${text(c.city)}, ${text(c.state)}, ${textArray(c.athleticAssociations)}, ${textArray(c.nicknames)}, ${text(input.collegeSourceId)})`
  );
  const fieldValues = input.fields.map(
    (f) => `  (${text(f.code)}, ${text(f.title)}, ${text(f.familyCode)}, ${text(input.fieldSourceId)})`
  );

  return [
    input.header,
    '',
    'insert into data_sources (id, publisher, dataset, edition, url, retrieved_on, checksum, notes) values',
    sourceValues.join(',\n'),
    'on conflict (id) do update set',
    '  publisher = excluded.publisher, dataset = excluded.dataset, edition = excluded.edition,',
    '  url = excluded.url, retrieved_on = excluded.retrieved_on, checksum = excluded.checksum,',
    '  notes = excluded.notes;',
    '',
    'insert into colleges (id, name, city, state, athletic_associations, nicknames, source_id) values',
    collegeValues.join(',\n'),
    'on conflict (id) do update set',
    '  name = excluded.name, city = excluded.city, state = excluded.state,',
    '  athletic_associations = excluded.athletic_associations, nicknames = excluded.nicknames,',
    '  source_id = excluded.source_id;',
    '',
    'insert into fields_of_study (code, title, family_code, source_id) values',
    fieldValues.join(',\n'),
    'on conflict (code) do update set',
    '  title = excluded.title, family_code = excluded.family_code, source_id = excluded.source_id;',
    '',
  ].join('\n');
}
