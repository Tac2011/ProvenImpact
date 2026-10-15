// Bio import: the shape Claude returns, the checks applied before a student sees any of
// it, and (below) merging the result into the profile form. Pure, so it's tested
// without Claude.

import { z } from 'zod';
import {
  DEGREE_TYPES,
  EMPTY_PICK,
  degreeShort,
  emptyEducation,
  formatMonthYear,
  type DegreeType,
  type EducationFormValues,
  type PickValue,
} from './education';
import { normalize, searchOptions, type PickerOption } from './pickerSearch';
import { SPORTS } from './sports';
import type { SportType } from './validateProfile';

export const BIO_MAX_LENGTH = 15_000;
export const HONOR_TITLE_MAX = 200;
export const HONOR_YEARS_MAX = 100;
export const IDEA_MAX_LENGTH = 500;
const NAME_MAX = 100;
const MAX_HONORS = 30;
const MAX_IDEAS = 12;

const BioSchoolSchema = z.object({
  college: z.string(),
  is_current: z.boolean(),
  degree_type: z.string(),
  field_of_study: z.string(),
  start_month: z.number().int().nullable(),
  start_year: z.number().int().nullable(),
  end_month: z.number().int().nullable(),
  end_year: z.number().int().nullable(),
});

export const BioOutputSchema = z.object({
  cleaned_bio: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  sport: z.string(),
  positions: z.array(z.string()),
  disciplines: z.array(z.string()),
  schools: z.array(BioSchoolSchema),
  honors: z.array(z.object({ title: z.string(), years: z.string() })),
  story_ideas: z.array(z.object({ prompt: z.string(), source: z.enum(['bio', 'honor']) })),
});

export type BioOutput = z.infer<typeof BioOutputSchema>;
type RawSchool = z.infer<typeof BioSchoolSchema>;

export interface Honor {
  title: string;
  years: string;
}

export interface StoryIdea {
  prompt: string;
  source: 'bio' | 'honor';
}

export interface BioSchool {
  values: EducationFormValues;
  isCurrent: boolean;
  collegeText: string; // the bio's wording, for "Your bio says" hints
  fieldText: string;
}

export interface BioProfile {
  firstName: string;
  lastName: string;
  sport: string;
  sportType: SportType;
  positions: string[];
  disciplines: string[];
  sportText: string; // the bio's wording, kept when it isn't in the sports list
}

export interface CheckedBio {
  profile: BioProfile;
  current: BioSchool | null;
  previous: BioSchool[];
  honors: Honor[];
  ideas: StoryIdea[];
}

export interface CheckContext {
  colleges: PickerOption[];
  fields: PickerOption[];
  thisYear: number;
  earlierIdeas: string[];
  existingHonors: string[];
  pastedLength: number;
}

// Single-line values: trim, collapse spaces, cap the length.
function clean(text: string, max: number): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, max);
}

// Keeps the first of each item by normalized key, skipping keys already taken.
function uniqueBy<T>(items: T[], key: (item: T) => string, taken: string[] = []): T[] {
  const seen = new Set(taken.map(normalize));
  return items.filter((item) => {
    const k = normalize(key(item));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function checkPaste(input: unknown): { ok: true; text: string } | { ok: false; error: 'empty' | 'too_long' } {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return { ok: false, error: 'empty' };
  if (text.length > BIO_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, text };
}

// Fills a pick only when it's clear: an exact name match, or the only search result.
export function matchPick(options: PickerOption[], text: string): PickValue | null {
  const query = normalize(text);
  if (!query) return null;
  const results = searchOptions(options, text, options.length);
  const exact = results.find((option) => normalize(option.label) === query);
  const pick = exact ?? (results.length === 1 ? results[0] : null);
  return pick ? { id: pick.id, other: null } : null;
}

// Used for Claude's honors and again on the server for the ones the student kept,
// since those come back from the browser.
export function cleanHonors(raw: unknown[], existingTitles: string[]): Honor[] {
  const honors = raw.flatMap((item) => {
    const honor = item as { title?: unknown; years?: unknown } | null;
    if (typeof honor?.title !== 'string') return [];
    const years = typeof honor.years === 'string' ? clean(honor.years, HONOR_YEARS_MAX) : '';
    return [{ title: clean(honor.title, HONOR_TITLE_MAX), years }];
  });
  return uniqueBy(honors, (h) => h.title, existingTitles).slice(0, MAX_HONORS);
}

function checkYear(year: number | null, thisYear: number): number | null {
  return year !== null && year >= thisYear - 10 && year <= thisYear + 6 ? year : null;
}

// A month means nothing without its year.
function checkDate(month: number | null, year: number | null, thisYear: number) {
  const checkedYear = checkYear(year, thisYear);
  const checkedMonth = checkedYear !== null && month !== null && month >= 1 && month <= 12 ? month : null;
  return { month: checkedMonth, year: checkedYear };
}

function checkDegree(text: string, isCurrent: boolean): { degreeType: DegreeType | ''; degreeOther: string } {
  const value = text.trim().toUpperCase();
  if (value === 'MASTERS') return { degreeType: 'OTHER', degreeOther: "Master's" };
  if (value === 'NONE' && isCurrent) return { degreeType: '', degreeOther: '' };
  const known = DEGREE_TYPES.find((d) => d.value === value && d.value !== 'OTHER');
  return { degreeType: known?.value ?? '', degreeOther: '' };
}

function checkSchool(raw: RawSchool, ctx: CheckContext): BioSchool {
  const collegeText = clean(raw.college, 200);
  const fieldText = clean(raw.field_of_study, 200);
  const start = checkDate(raw.start_month, raw.start_year, ctx.thisYear);
  const end = checkDate(raw.end_month, raw.end_year, ctx.thisYear);
  return {
    isCurrent: raw.is_current,
    collegeText,
    fieldText,
    values: {
      ...emptyEducation(),
      college: matchPick(ctx.colleges, collegeText) ?? EMPTY_PICK,
      ...checkDegree(raw.degree_type, raw.is_current),
      primaryField: matchPick(ctx.fields, fieldText) ?? EMPTY_PICK,
      startMonth: start.month,
      startYear: start.year,
      endMonth: end.month,
      endYear: end.year,
    },
  };
}

export function checkBioOutput(
  raw: unknown,
  ctx: CheckContext
): { ok: true; cleanedText: string; bio: CheckedBio } | { ok: false; reason: 'unreadable' | 'empty' } {
  const parsed = BioOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'unreadable' };
  const output = parsed.data;

  // The prompt escapes < so the bio can't close its tag; turn it back for storage.
  const cleanedText = output.cleaned_bio.replace(/&lt;/g, '<').trim();
  if (!cleanedText || cleanedText.length > ctx.pastedLength) return { ok: false, reason: 'unreadable' };

  const sportText = clean(output.sport, NAME_MAX);
  const sport = SPORTS.find((s) => s.name.toLowerCase() === sportText.toLowerCase());
  const list = (items: string[]) => uniqueBy(items.map((item) => clean(item, NAME_MAX)), (item) => item);

  const profile: BioProfile = {
    firstName: clean(output.first_name, NAME_MAX),
    lastName: clean(output.last_name, NAME_MAX),
    sport: sport?.name ?? '',
    sportType: sport?.type ?? '',
    positions: sport?.type === 'team' ? list(output.positions) : [],
    disciplines: sport?.type === 'individual' ? list(output.disciplines) : [],
    sportText,
  };

  const schools = output.schools.filter((s) => s.college.trim()).map((s) => checkSchool(s, ctx));
  const current = schools.find((s) => s.isCurrent) ?? null;
  const honors = cleanHonors(output.honors, ctx.existingHonors);
  const ideas = uniqueBy(
    output.story_ideas.map((idea) => ({ prompt: clean(idea.prompt, IDEA_MAX_LENGTH), source: idea.source })),
    (idea) => idea.prompt,
    ctx.earlierIdeas
  ).slice(0, MAX_IDEAS);

  const found =
    profile.firstName || profile.lastName || sportText || schools.length > 0 || honors.length > 0 || ideas.length > 0;
  if (!found) return { ok: false, reason: 'empty' };

  return {
    ok: true,
    cleanedText,
    bio: { profile, current, previous: schools.filter((s) => s !== current), honors, ideas },
  };
}

export function honorLine(honor: Honor): string {
  return honor.years ? `${honor.title} · ${honor.years}` : honor.title;
}

function dateText(month: number | null, year: number | null): string {
  if (year === null) return '';
  return month === null ? String(year) : formatMonthYear(month, year);
}

export function schoolSummary(school: BioSchool): string {
  const { values } = school;
  const start = dateText(values.startMonth, values.startYear);
  const end = dateText(values.endMonth, values.endYear);
  const dates = start && end ? `${start} to ${end}` : start || end;
  return [
    school.collegeText,
    values.degreeType ? degreeShort(values.degreeType, values.degreeOther) : '',
    school.fieldText,
    dates,
  ]
    .filter(Boolean)
    .join(' · ');
}

// Rough on purpose: flags sentences for a person to check in the bio-check report.
const FAMILY_WORDS = /\b(born|parents?|mother|father|son of|daughter of|brothers?|sisters?|siblings?)\b/i;

export function possibleFamilyDetails(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => FAMILY_WORDS.test(sentence));
}
