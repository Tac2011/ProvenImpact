-- Development rubric written by Claude. Version 0, never published.
-- The app uses it only when ALLOW_DRAFT_RUBRIC=true (set in .env.local only).
-- The real rubric from Rubric_Template.docx is version 1 and replaces it.

insert into rubric_versions (version, notes)
values (0, 'DRAFT for development only. Written by Claude, not reviewed. Never publish.');

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values
(
  (select id from rubric_versions where version = 0),
  'resilience',
  'Resilience',
  'Recovers from setbacks and keeps performing, adjusting the plan instead of giving up when things go wrong.',
  'Faced a real setback (an injury, losing a starting spot, a failure) and took specific steps to come back. Stayed with it for weeks or months. Has a clear outcome: returned to play, won the spot back, or reached a measurable result.',
  'Faced a real setback and kept going, but the comeback was short, guided step by step by someone else, or has no clear outcome yet.',
  'Saying they are resilient or never give up. Bouncing back from one bad game. A hard situation described without anything they did about it.',
  '[
    {"story": "I tore my ACL junior year. I did rehab six days a week for nine months, kept going to team film sessions, and was starting again by the second game of senior year.", "rating": "strong", "why": "Serious setback, self-driven rehab for nine months, clear return."},
    {"story": "After I got benched midseason, I stayed after practice a few times to work on my defense and got some minutes back by the end of the year.", "rating": "moderate", "why": "A real response to a setback, but short and loosely described, with a partial outcome."}
  ]'
),
(
  (select id from rubric_versions where version = 0),
  'discipline',
  'Discipline',
  'Does the work that matters on a steady schedule without being pushed, and keeps doing it when it gets boring or hard.',
  'Kept a demanding routine on their own for a season or longer. Tracked it or has a measurable result. Kept it going through a setback or a busy stretch.',
  'Kept a routine someone else set, with steady attendance and visible improvement. Or: kept their own routine, but for a shorter stretch or without a clear result.',
  'Saying they are disciplined or hardworking. Showing up to required team practices, which every athlete on the team does. One intense week.',
  '[
    {"story": "I got up at 5:30 every school day for two years to get shots up before class, and my free throw percentage went from 61% to 78%.", "rating": "strong", "why": "Self-set routine, two years, measured result."},
    {"story": "I never missed a team practice my senior year.", "rating": "not_evidence", "why": "Practice was required; every athlete on the team did the same."}
  ]'
);
