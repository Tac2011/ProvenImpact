import { describe, expect, it } from 'vitest';
import { parseRubricDraft, rubricSql } from './rubricDraft';

const DRAFT = `# Rubric v2 Draft

## What changes from v1, in one place
1. **Results count.** Not a competency.

---

## 1. Leadership

**Definition:** Sees the way forward.

**Strong:** Sets standards with a result. **[CHANGED]** Captains count with actions.
*(v1 said: "old text")*

**Moderate:** Showed initiative.

**Doesn't count:** Saying "I'm a natural leader."
*(Removed from v1: "Being named captain.")*

**Examples:**
- **Strong:** We won 3 of our last 4.
  *Why:* Organized it without being asked.
- **[NEW] Moderate:** My teammates voted me captain.
  *Why:* Teammates’ trust.

**Question for you both:** Is this right?

---

## 7. Achievement [NEW]

**Definition:** Hits targets.

**Strong:** **[CHANGED]** Goal, preparation, result.

**Moderate:** A result alone.

**Doesn't count:** Effort alone.

**Examples:**
- **Not evidence:** I'm a winner.
  *Why:* No result.

## Next steps

1. Not a competency.
`;

describe('parseRubricDraft', () => {
  it('reads numbered competencies only, with keys from labels and [NEW] dropped', () => {
    const comps = parseRubricDraft(DRAFT);
    expect(comps.map((c) => [c.key, c.label])).toEqual([
      ['leadership', 'Leadership'],
      ['achievement', 'Achievement'],
    ]);
  });

  it('strips review marks and notes, keeping apostrophes and curly quotes', () => {
    const [leadership, achievement] = parseRubricDraft(DRAFT);
    expect(leadership.strong).toBe('Sets standards with a result. Captains count with actions.');
    expect(leadership.notEvidence).toBe('Saying "I\'m a natural leader."');
    expect(achievement.strong).toBe('Goal, preparation, result.');
    expect(JSON.stringify(parseRubricDraft(DRAFT))).not.toMatch(/CHANGED|NEW\]|v1 said|Removed from v1|Question for you/);
  });

  it('reads examples with their rating and why', () => {
    const [leadership, achievement] = parseRubricDraft(DRAFT);
    expect(leadership.examples).toEqual([
      { story: 'We won 3 of our last 4.', rating: 'strong', why: 'Organized it without being asked.' },
      { story: 'My teammates voted me captain.', rating: 'moderate', why: 'Teammates’ trust.' },
    ]);
    expect(achievement.examples[0].rating).toBe('not_evidence');
  });

  it('stops and names the competency when a field is missing', () => {
    expect(() => parseRubricDraft(DRAFT.replace('**Moderate:** A result alone.', ''))).toThrow(
      'Achievement: missing "Moderate"'
    );
  });

  it('stops when a competency has no examples', () => {
    expect(() => parseRubricDraft(DRAFT.replace('- **Not evidence:** I\'m a winner.', '- Strong: typo'))).toThrow(
      'Achievement: no examples'
    );
  });
});

describe('rubricSql', () => {
  const comps = parseRubricDraft(DRAFT);
  const sql = rubricSql(2, 'Results, Achievement, Analytical, captains', comps);

  it('creates the version once and replaces competencies only while it is a draft', () => {
    expect(sql).toContain("insert into rubric_versions (version, notes) values (2, $q$Results, Achievement, Analytical, captains$q$) on conflict (version) do nothing;");
    expect(sql).toContain('delete from rubric_competencies where rubric_version_id in (select id from rubric_versions where version = 2 and published_at is null);');
    expect(sql.match(/from rubric_versions where version = 2 and published_at is null;/g)).toHaveLength(comps.length);
  });

  it('writes examples as JSON the database can read back', () => {
    const json = sql.match(/\$j\$([\s\S]*?)\$j\$/)?.[1] ?? '';
    expect(JSON.parse(json)[1]).toEqual({ story: 'My teammates voted me captain.', rating: 'moderate', why: 'Teammates’ trust.' });
  });

  it('refuses text that would end the SQL quoting', () => {
    const bad = [{ ...comps[0], definition: 'a $q$ b' }];
    expect(() => rubricSql(2, 'n', bad)).toThrow('Leadership: text contains $q$ or $j$');
  });
});
