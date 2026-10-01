-- How to load a rubric from Rubric_Template.docx.
-- Copy this file, fill it in from the template, and run it in the Supabase SQL editor.
-- Use the next unused version number. Write an apostrophe inside text as two: 'Doesn''t count'.

-- 1. Create the version as a draft. It stays invisible on the live site until step 4.
insert into rubric_versions (version, notes)
values (1, 'First rubric from Rubric_Template.docx');

-- 2. Add one competency. Repeat this insert for each one (4 to 6).
insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'confidence',   -- lowercase with underscores; never changes once published
  'Confidence',
  'What it means to an employer, from the template.',
  'Strong evidence looks like, from the template.',
  'Moderate evidence looks like, from the template.',
  'Doesn''t count, from the template.',
  '[
    {"story": "Example story 1, from the template.", "rating": "strong", "why": "Her one line on why."},
    {"story": "Example story 2, from the template.", "rating": "moderate", "why": "Her one line on why."}
  ]'
);
-- rating is one of: strong, moderate, not_evidence

-- 3. Run the check and review the report with her:
--      npm run rubric-check -- 1 "C:/development/Claude Code/Proven/Rubric_Check_v1.md"
--    While the version is a draft, fix wording with update statements and run the check again.

-- 4. Publish. After this the version is never edited; changes go in a new version.
-- update rubric_versions set published_at = now() where version = 1;
