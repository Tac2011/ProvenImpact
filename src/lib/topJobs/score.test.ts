import { describe, expect, it } from 'vitest';
import {
  degreeFits,
  degreeLinkText,
  earlyNote,
  fieldsFromEducation,
  matchLevel,
  outlookText,
  payText,
  proofWeight,
  rankJobs,
  strengthProfile,
  type RankedJob,
  type ScoringInput,
} from './score';

const KEYS = ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'];
const even = Object.fromEntries(KEYS.map((k) => [k, 1 / 6]));
const leaderJob = { leadership: 0.7, discipline: 0.1, resilience: 0.1, adaptability: 0, communication: 0.1, execution: 0 };

describe('fieldsFromEducation', () => {
  it('weights current and previous, primary and secondary fields, skipping uncoded ones', () => {
    const fields = fieldsFromEducation(
      [
        { isCurrent: true, primaryCode: '52.02', secondaryCode: '27.01' },
        { isCurrent: false, primaryCode: '23.01', secondaryCode: null },
        { isCurrent: false, primaryCode: null, secondaryCode: '16.04' },
      ],
      { '52.02': 'Business', '27.01': 'Mathematics', '23.01': 'English', '16.04': 'Slavic Languages' }
    );
    expect(fields).toEqual([
      { code: '52.02', title: 'Business', weight: 1 },
      { code: '27.01', title: 'Mathematics', weight: 0.6 },
      { code: '23.01', title: 'English', weight: 0.8 },
      { code: '16.04', title: 'Slavic Languages', weight: 0.5 },
    ]);
  });
});

describe('strengthProfile', () => {
  const selfMap = { leadership: { leadership: 1 }, work_ethic: { discipline: 1 } };

  it('gives diminishing returns for evidence and blends in self-assessment', () => {
    const profile = strengthProfile(
      KEYS,
      [
        { competencyKey: 'leadership', strength: 'strong' },
        { competencyKey: 'leadership', strength: 'strong' },
      ],
      { leadership: 5, work_ethic: 3 },
      selfMap
    );
    expect(profile.leadership).toBeCloseTo(0.75 * (1 - Math.exp(-1)) + 0.25 * 1, 6);
    expect(profile.discipline).toBeCloseTo(0.5 * 0.5, 6);
    expect(profile.resilience).toBe(0);
  });

  it('counts moderate evidence as half', () => {
    const strong = strengthProfile(KEYS, [{ competencyKey: 'execution', strength: 'strong' }], {}, {});
    const twoModerate = strengthProfile(
      KEYS,
      [
        { competencyKey: 'execution', strength: 'moderate' },
        { competencyKey: 'execution', strength: 'moderate' },
      ],
      {},
      {}
    );
    expect(twoModerate.execution).toBeCloseTo(strong.execution, 6);
  });
});

describe('degreeFits', () => {
  it('takes the best field weight plus a bonus per extra linked field, capped at 1', () => {
    const fits = degreeFits(
      [
        { code: '52.02', title: 'Business', weight: 1 },
        { code: '27.01', title: 'Mathematics', weight: 0.6 },
      ],
      { '52.02': ['13-1111.00', '15-2051.01'], '27.01': ['15-2051.01', '15-2041.00'] }
    );
    expect(fits.get('13-1111.00')).toEqual({ fit: 1, titles: ['Business'] });
    expect(fits.get('15-2051.01')).toEqual({ fit: 1, titles: ['Business', 'Mathematics'] });
    expect(fits.get('15-2041.00')?.fit).toBeCloseTo(0.6, 6);
  });

  it('counts the same field on two schools once, at its best weight', () => {
    const fits = degreeFits(
      [
        { code: '27.01', title: 'Mathematics', weight: 0.6 },
        { code: '27.01', title: 'Mathematics', weight: 0.8 },
      ],
      { '27.01': ['15-2041.00'] }
    );
    expect(fits.get('15-2041.00')).toEqual({ fit: 0.8, titles: ['Mathematics'] });
  });
});

describe('proofWeight and matchLevel', () => {
  it('grows with experiences up to 0.7', () => {
    expect(proofWeight(0)).toBeCloseTo(0.15, 6);
    expect(proofWeight(1)).toBeCloseTo(0.26, 6);
    expect(proofWeight(5)).toBeCloseTo(0.7, 6);
    expect(proofWeight(10)).toBeCloseTo(0.7, 6);
  });

  it('sets levels by score and holds back Strong until 3 experiences', () => {
    expect(matchLevel(70, 3)).toBe('strong');
    expect(matchLevel(69, 3)).toBe('good');
    expect(matchLevel(49, 3)).toBe('possible');
    expect(matchLevel(90, 2)).toBe('good');
  });
});

function input(overrides: Partial<ScoringInput>): ScoringInput {
  return {
    competencies: KEYS,
    evidence: [],
    experienceCount: 0,
    selfScores: {},
    selfMap: {},
    fields: [],
    fieldOccupations: {},
    openList: [],
    needs: {},
    titles: {},
    ...overrides,
  };
}

describe('rankJobs', () => {
  it('gives a student with no coded field the open list, ranked, with "open to any major"', () => {
    const ranked = rankJobs(
      input({
        openList: ['A', 'B'],
        needs: { A: even, B: leaderJob },
        titles: { A: 'Alpha', B: 'Beta' },
        evidence: [{ competencyKey: 'leadership', strength: 'strong' }],
        experienceCount: 1,
      })
    );
    expect(ranked.map((j) => j.code)).toEqual(['B', 'A']);
    expect(ranked[0].linkedFields).toEqual([]);
  });

  it('lets proven strengths lift an open job above a weak degree link once experiences add up', () => {
    const shared = {
      fields: [{ code: '23.01', title: 'English', weight: 1 }],
      fieldOccupations: { '23.01': ['PROOF'] },
      openList: ['PM'],
      needs: { PROOF: { ...even, leadership: 0, communication: 1 / 6 + 1 / 6 }, PM: leaderJob },
      titles: { PROOF: 'Proofreaders', PM: 'Project Management Specialists' },
    };
    const leadership = Array.from({ length: 6 }, () => ({ competencyKey: 'leadership', strength: 'strong' as const }));
    const early = rankJobs(input({ ...shared, experienceCount: 0 }));
    const later = rankJobs(input({ ...shared, evidence: leadership, experienceCount: 6 }));
    expect(early[0].code).toBe('PROOF');
    expect(later[0].code).toBe('PM');
  });

  it('skips candidates with no needs row and breaks ties by title', () => {
    const ranked = rankJobs(input({ openList: ['Z', 'Y', 'X'], needs: { Z: even, Y: even }, titles: { Z: 'Aardvark', Y: 'Badger' } }));
    expect(ranked.map((j) => j.code)).toEqual(['Z', 'Y']);
  });

  it('tags up to three competencies that drive the fit', () => {
    const [job] = rankJobs(
      input({
        openList: ['B'],
        needs: { B: leaderJob },
        evidence: [{ competencyKey: 'leadership', strength: 'strong' }],
        experienceCount: 1,
      })
    );
    expect(job.tags).toEqual(['leadership']);
  });

  it('gives the same list for the same input', () => {
    const data = input({ openList: ['A', 'B', 'C'], needs: { A: even, B: leaderJob, C: even }, titles: { A: 'A', B: 'B', C: 'C' } });
    expect(rankJobs(data)).toEqual(rankJobs(data));
  });
});

function job(level: RankedJob['level']): RankedJob {
  return { code: 'X', score: 60, level, tags: [], linkedFields: [] };
}

describe('earlyNote', () => {
  const good = Array.from({ length: 10 }, () => job('good'));

  it('is quiet with enough good matches, experiences, and a coded field', () => {
    expect(earlyNote(good, { hasCodedField: true, experienceCount: 6, inProgressCount: 0 })).toBeNull();
  });

  it('names the field of study and experiences, merged into one sentence', () => {
    expect(earlyNote(good, { hasCodedField: false, experienceCount: 2, inProgressCount: 0 })).toBe(
      'These are early results. Add your field of study and a few more experiences, and your matches will sharpen.'
    );
  });

  it('shows when fewer than 4 are Strong or Good, asking to finish in-progress experiences', () => {
    const weak = [...Array.from({ length: 3 }, () => job('good')), ...Array.from({ length: 7 }, () => job('possible'))];
    expect(earlyNote(weak, { hasCodedField: true, experienceCount: 6, inProgressCount: 2 })).toBe(
      'These are early results. Finish your in-progress experiences, and your matches will sharpen.'
    );
    expect(earlyNote(weak, { hasCodedField: true, experienceCount: 6, inProgressCount: 0 })).toBe(
      'These are early results. Add more experiences, and your matches will sharpen.'
    );
  });
});

describe('display text', () => {
  it('describes the degree link', () => {
    expect(degreeLinkText([])).toBe('Open to any major');
    expect(degreeLinkText(['Business'])).toBe('Linked to your Business degree');
    expect(degreeLinkText(['Business', 'Mathematics'])).toBe('Linked to your Business and Mathematics degrees');
    expect(degreeLinkText(['A', 'B', 'C'])).toBe('Linked to your A, B, and C degrees');
  });

  it('formats pay and outlook', () => {
    expect(payText(100750)).toBe('$100,750 typical pay');
    expect(payText(null)).toBe('Pay data not available');
    expect(outlookText(9)).toBe('Growing much faster than average');
    expect(outlookText(2.5)).toBe('Growing about as fast as average');
    expect(outlookText(-3)).toBe('Expected to decline');
    expect(outlookText(null)).toBe('Outlook data not available');
  });
});
