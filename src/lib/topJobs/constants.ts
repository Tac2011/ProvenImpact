// Every tunable number in top jobs matching, in one place. See the design spec's
// Matching section. Change a value here, rerun npm run top-jobs-check, compare reports.

export const SCORING_VERSION = 1;
export const REFERENCE_VERSION = 'onet-31.0';

export const JOB_ZONES = [3, 4, 5];
export const TOP_COUNT = 10;

// Strength profile.
export const EVIDENCE_POINTS = { strong: 1, moderate: 0.5 } as const;
export const EVIDENCE_SCALE = 2; // evidence = 1 - exp(-points / EVIDENCE_SCALE)
export const EVIDENCE_SHARE = 0.75; // with evidence: 0.75 evidence + 0.25 self
export const SELF_ONLY_CAP = 0.5; // without evidence: 0.5 * self

// Degree fit.
export const FIELD_WEIGHTS = {
  currentPrimary: 1,
  currentSecondary: 0.6,
  previousPrimary: 0.8,
  previousSecondary: 0.5,
} as const;
export const EXTRA_FIELD_BONUS = 0.15;
export const OPEN_DEGREE_FIT = 0.6;

// Proof weight: w = min(max, base + perExperience * experiences).
export const PROOF_WEIGHT = { base: 0.15, perExperience: 0.11, max: 0.7 } as const;

// Match levels and the early results note.
export const LEVELS = { strong: 70, good: 50 } as const;
export const EARLY_MIN_GOOD = 4;
export const FEW_EXPERIENCES = 3;
export const ENOUGH_EXPERIENCES = 5;
export const TAG_MIN = 0.05;

// Outlook wording by projected 10-year percent change.
export const OUTLOOK = [
  { min: 8, text: 'Growing much faster than average' },
  { min: 4, text: 'Growing faster than average' },
  { min: 1, text: 'Growing about as fast as average' },
  { min: -1, text: 'Little or no change expected' },
  { min: -Infinity, text: 'Expected to decline' },
] as const;

export const EXPLANATION_MAX = 600;
