import type { SportType } from './validateProfile';

export interface Sport {
  name: string;
  type: SportType;
}

// Top 10 for now by NCAA sponsorship/participation. Add more later as needed.
export const SPORTS: Sport[] = [
  { name: 'Football', type: 'team' },
  { name: 'Basketball', type: 'team' },
  { name: 'Baseball', type: 'team' },
  { name: 'Softball', type: 'team' },
  { name: 'Soccer', type: 'team' },
  { name: 'Volleyball', type: 'team' },
  { name: 'Track and Field', type: 'individual' },
  { name: 'Cross Country', type: 'individual' },
  { name: 'Tennis', type: 'individual' },
  { name: 'Golf', type: 'individual' },
];

export function getSportType(sportName: string): SportType {
  return SPORTS.find((s) => s.name === sportName)?.type ?? '';
}
