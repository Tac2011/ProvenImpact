-- Rubric version 1, loaded from Rubric_Template.docx (2026-10-05) as written by Todd's partner.
-- Draft: the live site ignores it until published (step 4 below).
-- Text uses $q$...$q$ quoting so apostrophes and quote marks need no escaping.

insert into rubric_versions (version, notes)
values (1, 'First rubric from Rubric_Template.docx, 2026-10-05');

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'leadership',
  $q$Leadership$q$,
  $q$The ability to see a problem and determine the best way forward and then being able to express the plan to subordinates and management. Good leadership is defined by the ability to inspire, guide, empower and then communicate a shared goal.$q$,
  $q$The ability to see the team as a whole but also being able to set in and set standards without being given specific authority.$q$,
  $q$Showed initiative after someone else set the goals and standards$q$,
  $q$I was put in charge and my teammates followed me$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$During a midseason slump, our team was struggling with confidence. I organized extra film sessions, kept energy high in practice, and made sure younger players felt supported. We turned the momentum around and finished the season strong with 3 wins in our final 4 games$q$, 'rating', 'strong', 'why', $q$organized sessions without the prompting of coaches. Understood the importance of setting an example for younger players. Then gave specific example of increase in performance$q$),
    jsonb_build_object('story', $q$I made it a point to be the first one in the gym and encouraged my teammates to do the same. I established specialized workouts for each position and encouraged each position to have position leader. Over time, teammates started joining me, and it raised the overall work ethic of the group.$q$, 'rating', 'moderate', 'why', $q$recognition of the need to set the example so others would follow. The establishing of team leads shows that he/she did not need to be “in charge”. Specific examples of performance would have been better than simply stating “… raised the work ethic of the group”$q$)
  )
);

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'discipline',
  $q$Discipline$q$,
  $q$Keeps commitments and maintains reliable habits over time. A manager sees consistent preparation, follow-through, and responsible management of competing demands.$q$,
  $q$Describes a repeatable routine across a season or another meaningful period, with concrete frequency or milestones. Tracks commitments and manages competing demands with limited reminders. Shows consistent adherence; improved athletic performance is not required$q$,
  $q$Completes a defined routine over a shorter period or relies on reminders. Gives specific evidence of follow-through, but independent management or consistency over time is limited.$q$,
  $q$Calling oneself dedicated. Simply being on a team or attending required activities without detail. One intense workout, extreme training volume, or ignoring recovery guidance$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$For our 16-week season, I scheduled four weekly training sessions and two study blocks around classes and travel. I logged each session and moved study blocks before away games. I completed 60 of 64 sessions; the other four were rest days agreed with our trainer$q$, 'rating', 'strong', 'why', $q$Shows a sustained routine, tracking, and independent scheduling. Agreed recovery days do not weaken responsible follow-through$q$),
    jsonb_build_object('story', $q$For three preseason weeks, I completed all three weekly lifting sessions. Our coach sent reminders before each session, and I checked off the workouts afterward.$q$, 'rating', 'moderate', 'why', $q$Specific, repeated follow-through is present, but the period is short and reminders support adherence$q$)
  )
);

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'resilience',
  $q$Resilience$q$,
  $q$Responds constructively after disappointment, failure, or disruption. A manager sees someone who seeks support when needed, takes useful next steps, and rebuilds progress$q$,
  $q$Names a meaningful setback and describes constructive actions afterward. Sustains those actions through difficulty or further disappointment and shows restored participation, progress, or a workable new direction. Returning to a previous performance level is not required.$q$,
  $q$Describes a setback and at least one constructive response. Recovery is early, follow-through is brief, or progress is not yet clear$q$,
  $q$Experiencing injury or hardship without describing a response. Saying “I never give up.” Winning after a loss without explaining actions. Playing through injury against medical advice.$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$After an ankle injury ended my season, I followed the trainer’s recovery plan for 12 weeks and kept a weekly progress log. When a reassessment delayed running, I asked for safe alternatives and continued approved work. I later returned to modified team practice with clearance$q$, 'rating', 'strong', 'why', $q$Describes sustained constructive action, response to a further setback, and a concrete recovery milestone within medical guidance$q$),
    jsonb_build_object('story', $q$After I missed the qualifying standard, I met with my coach to review the race and completed the next week of planned practices. I have not raced again yet$q$, 'rating', 'moderate', 'why', $q$Shows a constructive initial response to disappointment; sustained rebuilding and later progress are not yet described.$q$)
  )
);

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'adaptability',
  $q$Adaptability$q$,
  $q$Adjusts methods when conditions, roles, or information change. A manager sees someone who learns, tests a different approach, and uses feedback to improve it$q$,
  $q$Identifies a change or evidence that the old approach was ineffective. Explains a specific adjustment, applies it, and checks how it worked. Refines the approach or demonstrates effective use in the new conditions$q$,
  $q$Makes a concrete adjustment to a new role or instruction, but testing, refinement, or effectiveness is limited. Following a suggested change can count when actual application is described.$q$,
  $q$A new coach, role, or system without describing changed behavior. Saying “I am flexible.” Continuing the same approach after a setback. Obeying instructions without evidence of learning or application$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$When our team changed defensive systems, I initially missed rotation assignments. I reviewed clips with our coach, built a cue sheet, and practiced the rotations with a teammate. Over four games, my missed assignments fell from six to one per game, and I updated the cues for the coverage I still missed.$q$, 'rating', 'strong', 'why', $q$Identifies a changed demand, applies a new learning method, checks results, and refines the response.$q$),
    jsonb_build_object('story', $q$When our coach moved me to a new position, I practiced its footwork for two sessions and used the new steps in a scrimmage. I have not reviewed how well I performed yet.$q$, 'rating', 'moderate', 'why', $q$A specific adjustment was applied, but effectiveness and refinement remain unknown$q$)
  )
);

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'communication',
  $q$Communication$q$,
  $q$Listens, shares useful information clearly, and checks that people understand one another. A manager sees fewer misunderstandings and clearer expectations or handoffs.$q$,
  $q$Describes a communication need, listens to others, and adapts the message or channel to the audience. Checks understanding and shows a concrete result such as corrected confusion, agreed responsibilities, or a reliable handoff. A single complex interaction can qualify.$q$,
  $q$Shares relevant information or listens and clarifies in a straightforward situation. Audience adaptation, confirmation of understanding, or the resulting alignment is limited.$q$,
  $q$Being outgoing, popular, loud, or a frequent speaker. Saying “I am a good communicator.” Sending messages without describing their content or purpose. Polished wording alone.$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$New teammates were using different names for the same defensive calls. I asked each group which terms they used, worked with the coach to agree on one set, and made a short reference sheet. I asked players to explain each call back during practice. By the next scrimmage, everyone used the agreed terms and we had no call-related mix-ups.$q$, 'rating', 'strong', 'why', $q$Listens, tailors a shared reference, confirms understanding, and describes resolved confusion.$q$),
    jsonb_build_object('story', $q$Before an away meet, I posted the coach’s departure time and packing list in our team chat. One teammate asked which entrance to use, so I checked with the coach and replied$q$, 'rating', 'moderate', 'why', $q$Gives useful information and resolves one question, but broader understanding and alignment are not established$q$)
  )
);

insert into rubric_competencies
  (rubric_version_id, key, label, definition, strong_evidence, moderate_evidence, not_evidence, examples)
values (
  (select id from rubric_versions where version = 1),
  'execution',
  $q$Execution$q$,
  $q$Turns a goal into completed work that meets agreed requirements. A manager sees someone who plans tasks, manages dependencies, resolves obstacles, and delivers a usable result.$q$,
  $q$Defines a deliverable and success criteria, organizes the work, and owns follow-through. Coordinates dependencies or resolves an obstacle. Completes the deliverable and checks it against the deadline, scope, quality, or other agreed requirements$q$,
  $q$Completes a bounded assigned task with a concrete result, but planning and ownership are limited. A larger project still in progress may show Moderate evidence when meaningful completed milestones are specified.$q$,
  $q$Ideas, goals, or plans with no completed work. Effort or attendance alone. Winning without explaining the athlete’s contribution. Claiming the team’s entire result without identifying personal actions.$q$,
  jsonb_build_array(
    jsonb_build_object('story', $q$I owned logistics for a team clinic with a goal of serving 40 local students. I built the schedule, confirmed the gym and volunteers, and tracked registrations. When two volunteers canceled, I reassigned stations and shortened transitions. We ran the clinic on the planned date for 43 students, completed every station, and stayed within our $300 budget.$q$, 'rating', 'strong', 'why', $q$Shows planning, ownership, obstacle resolution, and a completed deliverable checked against scope, timing, and budget.$q$),
    jsonb_build_object('story', $q$For our team clinic, the coach asked me to prepare 30 equipment kits using a checklist. I assembled and checked all 30 before the deadline and handed them to the event lead.$q$, 'rating', 'moderate', 'why', $q$Delivers a specific assigned output on time, with limited evidence of broader planning or dependency management.$q$)
  )
);

-- Check: expect 6 rows, each with 2 examples.
select c.key, jsonb_array_length(c.examples) as examples
from rubric_competencies c join rubric_versions v on v.id = c.rubric_version_id
where v.version = 1 order by c.key;

-- Publish only after the rubric check matches her judgment:
-- update rubric_versions set published_at = now() where version = 1;
