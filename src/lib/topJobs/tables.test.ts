import { describe, expect, it } from 'vitest';
import { COMPETENCIES } from '../competencies';
import styleMap from '../../../supabase/reference/top-jobs/style-map.json';
import selfMap from '../../../supabase/reference/top-jobs/self-map.json';
import openList from '../../../supabase/reference/top-jobs/open-list.json';
import excluded from '../../../supabase/reference/top-jobs/excluded.json';
import styleMapV2 from '../../../supabase/reference/top-jobs/v2/style-map.json';
import selfMapV2 from '../../../supabase/reference/top-jobs/v2/self-map.json';
import keysV2 from '../../../supabase/reference/top-jobs/v2/competencies.json';

const WORK_STYLES = [
  'Achievement Orientation', 'Adaptability', 'Attention to Detail', 'Cautiousness', 'Cooperation',
  'Dependability', 'Empathy', 'Humility', 'Initiative', 'Innovation', 'Integrity',
  'Intellectual Curiosity', 'Leadership Orientation', 'Optimism', 'Perseverance', 'Self-Confidence',
  'Self-Control', 'Sincerity', 'Social Orientation', 'Stress Tolerance', 'Tolerance for Ambiguity',
];

type WeightMap = Record<string, Record<string, number>>;

const VERSIONS: { name: string; styleMap: WeightMap; selfMap: WeightMap; keys: string[] }[] = [
  { name: 'v1', styleMap, selfMap, keys: ['leadership', 'discipline', 'resilience', 'adaptability', 'communication', 'execution'] },
  { name: 'v2', styleMap: styleMapV2, selfMap: selfMapV2, keys: keysV2 },
];

describe.each(VERSIONS)('approved top jobs tables $name', ({ styleMap, selfMap, keys }) => {
  const onlyKeys = (map: WeightMap) =>
    Object.values(map).every((entry) => Object.entries(entry).every(([key, w]) => keys.includes(key) && w > 0 && w <= 1));

  it('maps every O*NET 31.0 work style, and only those', () => {
    expect(Object.keys(styleMap).sort()).toEqual([...WORK_STYLES].sort());
    expect(onlyKeys(styleMap)).toBe(true);
  });

  it('maps every self-assessment item, and only those', () => {
    expect(Object.keys(selfMap).sort()).toEqual(COMPETENCIES.map((c) => c.key).sort());
    expect(onlyKeys(selfMap)).toBe(true);
  });

  it('gives every competency at least one work style and one self-assessment item', () => {
    for (const key of keys) {
      expect(Object.values(styleMap).some((e) => key in e)).toBe(true);
      expect(Object.values(selfMap).some((e) => key in e)).toBe(true);
    }
  });
});

describe('approved top jobs lists', () => {
  it('v2 adds achievement and analytical to the v1 six', () => {
    expect([...keysV2].sort()).toEqual(
      ['achievement', 'adaptability', 'analytical', 'communication', 'discipline', 'execution', 'leadership', 'resilience']
    );
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
