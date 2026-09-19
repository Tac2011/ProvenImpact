export type SportType = 'team' | 'individual' | '';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  college: string;
  sport: string;
  sportType: SportType;
  degree: string;
  positions: string[];
  disciplines: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ProfileFormValues, string>>;
}

export function validateProfile(values: ProfileFormValues): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.college.trim()) errors.college = 'College is required';
  if (!values.sport.trim()) errors.sport = 'Sport is required';
  if (!values.degree.trim()) errors.degree = 'Degree is required';

  if (values.sportType !== 'team' && values.sportType !== 'individual') {
    errors.sportType = 'Select a sport type';
  } else if (values.sportType === 'team' && values.positions.length === 0) {
    errors.positions = 'Add at least one position';
  } else if (values.sportType === 'individual' && values.disciplines.length === 0) {
    errors.disciplines = 'Add at least one discipline';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
