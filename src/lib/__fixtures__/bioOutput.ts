// Test data for the bio import tests: small pick-lists and a Claude reading shaped like
// Cale Jacobsen's bio.
import type { BioOutput, CheckContext } from '../bioImport';
import type { PickerOption } from '../pickerSearch';

export const colleges: PickerOption[] = [
  { id: '1', label: 'University of Nebraska-Lincoln', detail: 'Lincoln, NE', nicknames: ['UNL'] },
  { id: '2', label: 'University of Nebraska at Omaha', detail: 'Omaha, NE', nicknames: ['UNO'] },
  { id: '3', label: 'Creighton University', detail: 'Omaha, NE', nicknames: [] },
];

export const fields: PickerOption[] = [
  { id: '52.0201', label: 'Business Administration and Management, General', nicknames: [] },
  { id: '26.0202', label: 'Biochemistry', nicknames: [] },
];

export const ctx: CheckContext = {
  colleges,
  fields,
  thisYear: 2026,
  earlierIdeas: [],
  existingHonors: [],
  pastedLength: 1000,
};

const noSchoolDates = { start_month: null, start_year: null, end_month: null, end_year: null };

export function caleOutput(): BioOutput {
  return {
    cleaned_bio: 'Cale Jacobsen, guard. Turned down scholarships to walk on at Nebraska.',
    first_name: 'Cale',
    last_name: 'Jacobsen',
    sport: 'basketball',
    positions: ['Guard', ' guard '],
    disciplines: ['400m'],
    schools: [
      {
        college: 'University of Nebraska-Lincoln',
        is_current: true,
        degree_type: 'MASTERS',
        field_of_study: '',
        ...noSchoolDates,
      },
      {
        college: 'University of Nebraska-Lincoln',
        is_current: false,
        degree_type: 'BBA',
        field_of_study: 'Business Administration',
        start_month: null,
        start_year: 2022,
        end_month: 5,
        end_year: 2025,
      },
    ],
    honors: [
      { title: 'Academic All-Big Ten', years: '2024, 2025, 2026' },
      { title: 'academic all-big ten', years: '' },
      { title: 'Tom Osborne Citizenship Team', years: '2023, 2024, 2025, 2026' },
    ],
    story_ideas: [
      { prompt: 'You tore your ACL in your first game as a junior. What did you do next?', source: 'bio' },
      { prompt: '   ', source: 'bio' },
    ],
  };
}
