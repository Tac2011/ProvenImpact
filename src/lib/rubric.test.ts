import { describe, expect, it } from 'vitest';
import { competencyLabel, pickCurrentRubric, toRubric, type RubricCompetency } from './rubric';

const draft0 = { id: 'v0', version: 0, published_at: null };
const pub1 = { id: 'v1', version: 1, published_at: '2026-10-05T00:00:00Z' };
const pub2 = { id: 'v2', version: 2, published_at: '2026-11-01T00:00:00Z' };
const draft3 = { id: 'v3', version: 3, published_at: null };

const confidence: RubricCompetency = {
  key: 'confidence',
  label: 'Confidence',
  definition: 'Trusts their own ability.',
  strong_evidence: 'Self-set goal.',
  moderate_evidence: 'Coach-set goal.',
  not_evidence: 'Saying they feel confident.',
  examples: [],
};

describe('pickCurrentRubric', () => {
  it('picks the highest published version', () => {
    expect(pickCurrentRubric([pub1, pub2, draft0], false)?.id).toBe('v2');
  });

  it('ignores a newer draft on the live site', () => {
    expect(pickCurrentRubric([pub1, draft3], false)?.id).toBe('v1');
  });

  it('returns null when only drafts exist, which hides the feature', () => {
    expect(pickCurrentRubric([draft0], false)).toBeNull();
    expect(pickCurrentRubric([], false)).toBeNull();
  });

  it('uses the highest version, draft or not, when drafts are allowed', () => {
    expect(pickCurrentRubric([draft0], true)?.id).toBe('v0');
    expect(pickCurrentRubric([draft0, pub1, draft3], true)?.id).toBe('v3');
  });
});

describe('toRubric', () => {
  it('builds a rubric from a version and its competencies', () => {
    expect(toRubric(pub1, [confidence])).toEqual({
      id: 'v1',
      version: 1,
      competencies: [confidence],
    });
  });

  it('treats a published version with no competencies as no rubric', () => {
    expect(toRubric(pub1, [])).toBeNull();
  });
});

describe('competencyLabel', () => {
  it('uses the rubric label', () => {
    expect(competencyLabel('confidence', [confidence])).toBe('Confidence');
  });

  it('makes an unknown key readable', () => {
    expect(competencyLabel('time_management', [confidence])).toBe('Time Management');
  });
});
