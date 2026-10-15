import { describe, expect, it } from 'vitest';
import { COMPETENCIES } from '../competencies';
import styleMap from '../../../supabase/reference/top-jobs/style-map.json';
import selfMap from '../../../supabase/reference/top-jobs/self-map.json';
import openList from '../../../supabase/reference/top-jobs/open-list.json';
import excluded from '../../../supabase/reference/top-jobs/excluded.json';

const RUBRIC_KEYS = ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'];
const WORK_STYLES = [
  'Achievement Orientation', 'Adaptability', 'Attention to Detail', 'Cautiousness', 'Cooperation',
  'Dependability', 'Empathy', 'Humility', 'Initiative', 'Innovation', 'Integrity',
  'Intellectual Curiosity', 'Leadership Orientation', 'Optimism', 'Perseverance', 'Self-Confidence',
  'Self-Control', 'Sincerity', 'Social Orientation', 'Stress Tolerance', 'Tolerance for Ambiguity',
];

function onlyRubricKeys(map: Record<string, Record<string, number>>) {
  return Object.values(map).every((entry) =>
    Object.entries(entry).every(([key, weight]) => RUBRIC_KEYS.includes(key) && weight > 0 && weight <= 1)
  );
}

describe('approved top jobs tables', () => {
  it('maps every O*NET 31.0 work style, and only those', () => {
    expect(Object.keys(styleMap).sort()).toEqual([...WORK_STYLES].sort());
    expect(onlyRubricKeys(styleMap)).toBe(true);
  });

  it('maps every self-assessment item, and only those', () => {
    expect(Object.keys(selfMap).sort()).toEqual(COMPETENCIES.map((c) => c.key).sort());
    expect(onlyRubricKeys(selfMap)).toBe(true);
  });

  it('gives every rubric competency at least one work style and one self-assessment item', () => {
    for (const key of RUBRIC_KEYS) {
      expect(Object.values(styleMap).some((entry) => key in entry)).toBe(true);
      expect(Object.values(selfMap).some((entry) => key in entry)).toBe(true);
    }
  });

  it('has 30 to 40 open-list jobs with O*NET codes, a reason each, and no repeats', () => {
    expect(openList.length).toBeGreaterThanOrEqual(30);
    expect(openList.length).toBeLessThanOrEqual(40);
    expect(openList.every((item) => /^\d{2}-\d{4}\.\d{2}$/.test(item.code) && item.reason.trim().length > 0)).toBe(true);
    expect(new Set(openList.map((item) => item.code)).size).toBe(openList.length);
  });

  it('never puts an excluded job on the open list', () => {
    const blocked = (code: string) =>
      excluded.codes.includes(code) || excluded.prefixes.some((p: string) => code.startsWith(p));
    expect(openList.filter((item) => blocked(item.code))).toEqual([]);
  });
});
