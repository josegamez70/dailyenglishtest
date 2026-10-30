export const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const WILDCARD_TOPIC = 'wildcard';

export const TOPICS = [
  { label: 'Daily Life', value: 'daily life' },
  { label: 'Any topic', value: WILDCARD_TOPIC },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'school_college', label: 'School / College' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'science', label: 'Science' },
  { value: 'economy_finance', label: 'Economy / Finance' },
  { value: 'travel', label: 'Travel' },
  { value: 'hobbies', label: 'Hobbies' },
  { value: 'health_sports', label: 'Health & Sports' },
  { value: 'technology', label: 'Technology' },
  { value: 'culture_food', label: 'Culture & Food' },
];

export const WORD_COUNTS = [
  { value: 60, label: '60 words' },
  { value: 100, label: '100 words' },
  { value: 140, label: '140 words' },
];

export const QUESTION_COUNTS = [
  { value: 5, label: '5 Questions' },
  { value: 8, label: '8 Questions' },
  { value: 10, label: '10 Questions' },
];

export type TopicChoice = {
  value: string;
  label: string;
  surprise: boolean;
};

export function selectableTopics() {
  return TOPICS.filter((topic) => topic.value !== WILDCARD_TOPIC);
}

/** Wildcard becomes a random real topic. The model never sees the word "wildcard". */
export function resolveTopic(topicValue: string, random: () => number = Math.random): TopicChoice {
  if (topicValue !== WILDCARD_TOPIC) {
    const found = TOPICS.find((topic) => topic.value === topicValue);
    return {
      value: found?.value ?? topicValue,
      label: found?.label ?? topicValue,
      surprise: false,
    };
  }
  const pool = selectableTopics();
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  const pick = pool[index];
  return { value: pick.value, label: pick.label, surprise: true };
}
