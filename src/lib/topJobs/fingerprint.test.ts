import { describe, expect, it } from 'vitest';
import { basedOnLine, changedLine, fingerprint, previousResult, type FingerprintInput } from './fingerprint';

describe('previousResult', () => {
  it('skips Try again rows with the same inputs, so New badges survive a retry', () => {
    const rows = [
      { id: 'retry', fingerprint: 'f2' },
      { id: 'update', fingerprint: 'f2' },
      { id: 'before', fingerprint: 'f1' },
    ];
    expect(previousResult(rows)?.id).toBe('before');
  });

  it('has no previous result for a first run, or when every row has the same inputs', () => {
    expect(previousResult([{ id: 'only', fingerprint: 'f1' }])).toBeUndefined();
    expect(previousResult([])).toBeUndefined();
    expect(previousResult([{ id: 'a', fingerprint: 'f1' }, { id: 'b', fingerprint: 'f1' }])).toBeUndefined();
  });
});

const base: FingerprintInput = {
  sport: 'Basketball',
  positions: ['Guard', 'Forward'],
  disciplines: [],
  fieldCodes: ['52.02', '27.01'],
  selfScores: { leadership: 4, work_ethic: 5 },
  experiences: [
    { id: 'e1', updatedAt: '2026-10-15T10:00:00Z', evidence: [{ competencyKey: 'leadership', strength: 'strong' }] },
    { id: 'e2', updatedAt: '2026-10-15T11:00:00Z', evidence: [] },
  ],
  honorTitles: ['Academic All-Big Ten', 'NABC Honors Court'],
  bioImportId: 'b1',
  versions: { rubricVersionId: 'r1', tablesVersionId: 't1', reference: 'onet-31.0', scoring: 1 },
};

describe('fingerprint', () => {
  it('is stable when lists come back in a different order', () => {
    const shuffled = {
      ...base,
      positions: ['Forward', 'Guard'],
      fieldCodes: ['27.01', '52.02'],
      experiences: [...base.experiences].reverse(),
      honorTitles: [...base.honorTitles].reverse(),
      selfScores: { work_ethic: 5, leadership: 4 },
    };
    expect(fingerprint(shuffled)).toBe(fingerprint(base));
  });

  it('changes when any input changes', () => {
    const f = fingerprint(base);
    expect(fingerprint({ ...base, selfScores: { ...base.selfScores, leadership: 5 } })).not.toBe(f);
    expect(fingerprint({ ...base, experiences: [{ ...base.experiences[0], updatedAt: '2026-10-16T00:00:00Z' }, base.experiences[1]] })).not.toBe(f);
    expect(fingerprint({ ...base, honorTitles: [...base.honorTitles, 'Big Ten Distinguished Scholar'] })).not.toBe(f);
    expect(fingerprint({ ...base, fieldCodes: ['52.02'] })).not.toBe(f);
    expect(fingerprint({ ...base, bioImportId: null })).not.toBe(f);
    expect(fingerprint({ ...base, versions: { ...base.versions, tablesVersionId: 't2' } })).not.toBe(f);
  });
});

describe('changedLine and basedOnLine', () => {
  it('names added experiences first, then honors, else a general change', () => {
    expect(changedLine({ experiences: 4, honors: 2, hasBio: true }, { experiences: 7, honors: 2, hasBio: true })).toBe(
      "You've added 3 experiences since these results."
    );
    expect(changedLine({ experiences: 4, honors: 2, hasBio: true }, { experiences: 5, honors: 2, hasBio: true })).toBe(
      "You've added 1 experience since these results."
    );
    expect(changedLine({ experiences: 4, honors: 2, hasBio: true }, { experiences: 4, honors: 4, hasBio: true })).toBe(
      "You've added 2 honors since these results."
    );
    expect(changedLine({ experiences: 4, honors: 2, hasBio: true }, { experiences: 4, honors: 2, hasBio: true })).toBe(
      'Your profile has changed since these results.'
    );
  });

  it('lists what results are based on, leaving out empty parts', () => {
    expect(basedOnLine({ experiences: 7, honors: 8, hasBio: true })).toBe(
      'Based on your profile, self-assessment, 7 experiences, 8 honors, and your bio.'
    );
    expect(basedOnLine({ experiences: 1, honors: 0, hasBio: false })).toBe(
      'Based on your profile, self-assessment, and 1 experience.'
    );
    expect(basedOnLine({ experiences: 0, honors: 0, hasBio: false })).toBe('Based on your profile and self-assessment.');
  });
});
