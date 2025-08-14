export const LEVELS = [
  { value: 'basic', label: 'Basic' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const TOPICS = [
  { label: 'Daily Life', value: 'daily life' },                     // 1º
  { label: 'Wildcard Topic (any subject)', value: 'wildcard' },     // 2º
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'daily_life', label: 'Daily Life' },
  { value: 'school_college', label: 'School / College' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'science', label: 'Science' },
  { value: 'economy_finance', label: 'Economy / Finance' },
  { value: 'travel', label: 'Travel' },
  { value: 'hobbies', label: 'Hobbies' }, // ← sustituye a Sports
];

export const WORD_COUNTS = [
  // Pedimos un poco más (120/170/220) manteniendo las etiquetas visibles de 100/150/200
  { value: 120, label: '100 words' },
  { value: 170, label: '150 words' },
  { value: 220, label: '200 words' },
];

export const QUESTION_COUNTS = [
  { value: 5, label: '5 Questions' },
  { value: 10, label: '10 Questions' },
  { value: 15, label: '15 Questions' },
];
