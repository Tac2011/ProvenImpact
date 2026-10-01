import { z } from 'zod';

export const ANSWER_MAX_LENGTH = 1000;
export const MAX_FOLLOWUPS = 2;
export const DAILY_RUN_LIMIT = 20;

export type ExperienceStatus = 'draft' | 'needs_followup' | 'mapped' | 'failed' | 'confirmed';
export type Strength = 'strong' | 'moderate';

export interface ExperienceAnswers {
  title: string;
  what_you_did: string;
  frequency: string;
  result: string;
  obstacle: string;
}

export type AnswerKey = keyof ExperienceAnswers;
export type AnswerErrors = Partial<Record<AnswerKey, string>>;

export interface Followup {
  question: string;
  answer: string | null;
}

export const EXPERIENCE_FIELDS: { key: AnswerKey; label: string; helper: string; example: string }[] = [
  {
    key: 'title',
    label: 'Give it a short title.',
    helper: 'What would you call it if you told a friend?',
    example: 'Weight room progression',
  },
  {
    key: 'what_you_did',
    label: 'What did you do?',
    helper: 'Describe your actions, not your feelings.',
    example: 'Lifted weights on my own schedule outside team workouts.',
  },
  {
    key: 'frequency',
    label: 'How often, and for how long?',
    helper: 'Times per week, number of months or seasons.',
    example: '4-5 times a week, freshman through junior year.',
  },
  {
    key: 'result',
    label: 'What did you measure or achieve?',
    helper: 'Numbers help: times, weights, percentages, rankings.',
    example: 'Raised squat, bench, and deadlift by at least 10% each year.',
  },
  {
    key: 'obstacle',
    label: 'What got in the way, and what did you do about it?',
    helper: 'An injury, a schedule conflict, a slump, a setback.',
    example:
      'A shoulder injury sophomore year; I switched to lower-body work and rehab until I was cleared.',
  },
];

export const STATUS_LABELS: Record<ExperienceStatus, string> = {
  draft: 'Not finished',
  needs_followup: 'Needs your answers',
  mapped: 'Ready to review',
  failed: 'Needs a retry',
  confirmed: 'Confirmed',
};

// Input comes from the browser, so anything that isn't a string counts as blank.
export function validateAnswers(
  input: Partial<Record<AnswerKey, unknown>>
): { ok: true; answers: ExperienceAnswers } | { ok: false; errors: AnswerErrors } {
  const answers = {} as ExperienceAnswers;
  const errors: AnswerErrors = {};

  for (const field of EXPERIENCE_FIELDS) {
    const raw = input[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      errors[field.key] = 'Required.';
    } else if (value.length > ANSWER_MAX_LENGTH) {
      errors[field.key] = `Keep it under ${ANSWER_MAX_LENGTH} characters.`;
    }
    answers[field.key] = value;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

// Claude may return blanks, repeats, or more questions than asked for. Keep at most two real ones.
export function keepFollowupQuestions(questions: string[]): Followup[] {
  const kept: string[] = [];
  for (const question of questions) {
    const text = question.trim();
    if (text && !kept.includes(text)) {
      kept.push(text);
    }
  }
  return kept.slice(0, MAX_FOLLOWUPS).map((question) => ({ question, answer: null }));
}

// A blank answer counts as skipped and is stored as null.
export function applyFollowupAnswers(followups: Followup[], answers: unknown[]): Followup[] {
  return followups.map((followup, i) => {
    const raw = answers[i];
    const text = typeof raw === 'string' ? raw.trim().slice(0, ANSWER_MAX_LENGTH) : '';
    return { question: followup.question, answer: text || null };
  });
}

// Each piece of text the athlete wrote, kept separate so a quote can't span two answers.
// Follow-up questions are Claude's words, so only the answers count.
export function athleteTexts(answers: ExperienceAnswers, followups: Followup[]): string[] {
  const texts = [
    answers.title,
    answers.what_you_did,
    answers.frequency,
    answers.result,
    answers.obstacle,
  ];
  for (const followup of followups) {
    if (followup.answer) {
      texts.push(followup.answer);
    }
  }
  return texts;
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Claude sometimes wraps a quote in quote marks, adds a closing period, or shortens it
// with an ellipsis. Strip those edges, straight or curly.
function trimQuoteEdges(text: string): string {
  return text.replace(/^["'“”‘’….,;:!?\s]+|["'“”‘’….,;:!?\s]+$/g, '');
}

// A quote counts only if it is at least two words and appears in one of the athlete's answers.
export function isAthleteQuote(quote: string, texts: string[]): boolean {
  const needle = trimQuoteEdges(normalizeForMatch(quote));
  if (needle.split(' ').length < 2) {
    return false;
  }
  return texts.some((text) => normalizeForMatch(text).includes(needle));
}

// The shape Claude is asked to return. Sent to the API as the output format.
export const MappingOutputSchema = z.object({
  behaviors: z.array(z.string()),
  evidence: z.array(
    z.object({
      competency_key: z.string(),
      strength: z.enum(['strong', 'moderate']),
      quote: z.string(),
      reason: z.string(),
    })
  ),
  resume_bullet: z.string(),
  interview_line: z.string(),
});

// Looser version for checking, so one bad evidence item is dropped instead of failing the whole result.
const LooseMappingSchema = z.object({
  behaviors: z.array(z.string()),
  evidence: z.array(
    z.object({
      competency_key: z.string(),
      strength: z.string(),
      quote: z.string(),
      reason: z.string(),
    })
  ),
  resume_bullet: z.string(),
  interview_line: z.string(),
});

export interface EvidenceItem {
  competency_key: string;
  strength: Strength;
  quote: string;
  reason: string;
}

export interface MappingResult {
  behaviors: string[];
  evidence: EvidenceItem[];
  resume_bullet: string;
  interview_line: string;
}

// Returns null when the output is unusable. Otherwise drops any evidence that names an
// unknown competency, has a bad strength, or quotes words the athlete didn't write.
export function validateMapping(
  raw: unknown,
  rubricKeys: string[],
  texts: string[]
): MappingResult | null {
  const parsed = LooseMappingSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const resumeBullet = parsed.data.resume_bullet.trim();
  const interviewLine = parsed.data.interview_line.trim();
  if (!resumeBullet || !interviewLine) {
    return null;
  }

  const byKey = new Map<string, EvidenceItem>();
  for (const item of parsed.data.evidence) {
    if (!rubricKeys.includes(item.competency_key)) continue;
    if (item.strength !== 'strong' && item.strength !== 'moderate') continue;
    if (!isAthleteQuote(item.quote, texts)) continue;

    // One item per competency. A strong item replaces a moderate one; otherwise the first stays.
    const existing = byKey.get(item.competency_key);
    const upgrades = existing?.strength === 'moderate' && item.strength === 'strong';
    if (existing && !upgrades) continue;

    byKey.set(item.competency_key, {
      competency_key: item.competency_key,
      strength: item.strength,
      quote: trimQuoteEdges(item.quote),
      reason: item.reason.trim(),
    });
  }

  return {
    behaviors: parsed.data.behaviors.map((b) => b.trim()).filter(Boolean),
    evidence: [...byKey.values()],
    resume_bullet: resumeBullet,
    interview_line: interviewLine,
  };
}

// The daily limit uses a rolling 24 hours, so it works the same in every time zone.
export function runWindowStart(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

// A run lasts at most two 30-second Claude calls plus saves, so a draft untouched for
// two minutes can't still be in progress.
export const RUN_STALE_AFTER_MS = 2 * 60 * 1000;

export function staleRunCutoff(now: Date): string {
  return new Date(now.getTime() - RUN_STALE_AFTER_MS).toISOString();
}

// Whether Try again should start a run. A failed experience always can; a draft only
// once its last run is too old to still be in progress.
export function retryDecision(
  status: ExperienceStatus,
  updatedAt: string,
  now: Date
): 'run' | 'busy' | 'done' {
  if (status === 'failed') {
    return 'run';
  }
  if (status === 'draft') {
    return new Date(updatedAt).getTime() < now.getTime() - RUN_STALE_AFTER_MS ? 'run' : 'busy';
  }
  return 'done';
}

export function isOverDailyLimit(runsInWindow: number): boolean {
  return runsInWindow >= DAILY_RUN_LIMIT;
}
