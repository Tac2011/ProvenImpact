import type { College, FieldOfStudy } from './education';

export interface PickerOption {
  id: string;
  label: string;
  detail?: string; // "City, ST" for schools
  nicknames: string[];
}

// Lowercase; drop periods and apostrophes ("U.N.O." -> "uno"); other punctuation
// becomes a space ("K-State" -> "k state").
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haystack(option: PickerOption): string {
  const text = normalize([option.label, option.detail ?? '', ...option.nicknames].join(' '));
  // Also a copy without spaces, so "kstate" finds "K-State".
  return `${text} ${text.replace(/ /g, '')}`;
}

function rank(option: PickerOption, query: string): number {
  if (option.nicknames.some((n) => normalize(n) === query)) return 0;
  if (normalize(option.label).startsWith(query)) return 1;
  return 2;
}

export function searchOptions(options: PickerOption[], query: string, limit = 50): PickerOption[] {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);
  const byLabel = (a: PickerOption, b: PickerOption) => a.label.localeCompare(b.label);

  if (words.length === 0) {
    return [...options].sort(byLabel).slice(0, limit);
  }

  return options
    .filter((option) => {
      const text = haystack(option);
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => rank(a, q) - rank(b, q) || byLabel(a, b))
    .slice(0, limit);
}

export function optionText(option: PickerOption): string {
  return option.detail ? `${option.label} · ${option.detail}` : option.label;
}

export function collegeOptions(colleges: College[]): PickerOption[] {
  return colleges.map((c) => ({
    id: String(c.id),
    label: c.name,
    detail: `${c.city}, ${c.state}`,
    nicknames: c.nicknames,
  }));
}

export function fieldOptions(fields: FieldOfStudy[]): PickerOption[] {
  return fields.map((f) => ({ id: f.code, label: f.title, nicknames: [] }));
}
