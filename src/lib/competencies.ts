export type CompetencyCategory =
  | 'cognitive'
  | 'behavioral'
  | 'interpersonal'
  | 'performance';

export interface Competency {
  key: string;
  label: string;
  category: CompetencyCategory;
}

export const COMPETENCY_CATEGORIES: { key: CompetencyCategory; label: string }[] = [
  { key: 'cognitive', label: 'Cognitive' },
  { key: 'behavioral', label: 'Behavioral' },
  { key: 'interpersonal', label: 'Interpersonal' },
  { key: 'performance', label: 'Performance' },
];

export const COMPETENCIES: Competency[] = [
  // Cognitive
  { key: 'problem_solving', label: 'Problem Solving', category: 'cognitive' },
  {
    key: 'decision_making_under_pressure',
    label: 'Decision-Making Under Pressure',
    category: 'cognitive',
  },
  { key: 'strategic_game_iq', label: 'Strategic / Game IQ', category: 'cognitive' },
  { key: 'learning_agility', label: 'Learning Agility', category: 'cognitive' },
  { key: 'attention_to_detail', label: 'Attention to Detail', category: 'cognitive' },
  { key: 'analytical_thinking', label: 'Analytical Thinking', category: 'cognitive' },

  // Behavioral
  { key: 'discipline', label: 'Discipline', category: 'behavioral' },
  { key: 'work_ethic', label: 'Work Ethic', category: 'behavioral' },
  { key: 'consistency', label: 'Consistency', category: 'behavioral' },
  { key: 'accountability', label: 'Accountability', category: 'behavioral' },
  { key: 'time_management', label: 'Time Management', category: 'behavioral' },
  { key: 'dependability', label: 'Dependability', category: 'behavioral' },

  // Interpersonal
  { key: 'team_communication', label: 'Team Communication', category: 'interpersonal' },
  { key: 'leadership', label: 'Leadership', category: 'interpersonal' },
  { key: 'coachability', label: 'Coachability', category: 'interpersonal' },
  { key: 'cooperation', label: 'Cooperation', category: 'interpersonal' },
  { key: 'conflict_resolution', label: 'Conflict Resolution', category: 'interpersonal' },
  {
    key: 'social_emotional_awareness',
    label: 'Social/Emotional Awareness',
    category: 'interpersonal',
  },

  // Performance
  { key: 'mental_toughness', label: 'Mental Toughness', category: 'performance' },
  { key: 'resilience', label: 'Resilience', category: 'performance' },
  { key: 'adaptability', label: 'Adaptability', category: 'performance' },
  { key: 'competitive_drive', label: 'Competitive Drive', category: 'performance' },
  { key: 'focus', label: 'Focus', category: 'performance' },
  {
    key: 'stress_pressure_tolerance',
    label: 'Stress/Pressure Tolerance',
    category: 'performance',
  },
];
