-- Leadership wording update for rubric version 1 (draft), 2026-10-05.
-- Why: her example ratings treat a specific, observable result as the line between
-- Strong and Moderate, but the written definitions didn't say so. Athletes see these
-- definitions, so they should explain the rating. Also fixes "set in" to "step in"
-- and fills out "Doesn't count" to match the other five competencies.
-- Allowed only because version 1 is still a draft. Never edit a published version.

update rubric_competencies
set
  strong_evidence = $q$The ability to see the team as a whole and step in to set standards without being given specific authority, with a specific, observable result: for example, improved performance, a measurable change in team habits, or a goal the team reached.$q$,
  moderate_evidence = $q$Showed initiative after someone else set the goals and standards. Or stepped in to set standards without authority, but without a specific, observable result.$q$,
  not_evidence = $q$I was put in charge and my teammates followed me. Being named captain without describing what you did. Saying "I'm a natural leader." Being the loudest voice. Taking credit for the team's results without naming your own actions.$q$
where key = 'leadership'
  and rubric_version_id = (select id from rubric_versions where version = 1 and published_at is null);

-- Check: expect one row with the new wording.
select key, strong_evidence, moderate_evidence, not_evidence
from rubric_competencies c join rubric_versions v on v.id = c.rubric_version_id
where v.version = 1 and c.key = 'leadership';
