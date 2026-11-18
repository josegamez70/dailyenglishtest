import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const TOPICS = [
  'daily life',
  'school_college',
  'travel',
  'hobbies',
  'health_sports',
  'culture_food',
  'technology',
  'science',
  'economy_finance',
  'mystery',
  'adventure',
  'fantasy',
];

export const TOPIC_LABELS = {
  'daily life': 'Daily Life',
  school_college: 'School / College',
  travel: 'Travel',
  hobbies: 'Hobbies',
  health_sports: 'Health & Sports',
  culture_food: 'Culture & Food',
  technology: 'Technology',
  science: 'Science',
  economy_finance: 'Economy / Finance',
  mystery: 'Mystery',
  adventure: 'Adventure',
  fantasy: 'Fantasy',
};

export const WORD_BOUNDS = {
  B1: [200, 250],
  B2: [300, 350],
  C1: [400, 450],
};

const SKILLS = new Set(['detail', 'inference', 'vocabulary', 'intent']);

export function countWords(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function readingContentHash(piece) {
  const quiz = piece.quiz.map((item) => ({
    question: oneLine(item.question),
    answer: oneLine(item.correctAnswer),
    options: item.options.map(oneLine).sort(),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const body = JSON.stringify({
    kind: 'reading',
    level: piece.level,
    format: 'text',
    topic: piece.topic,
    wordCount: countWords(piece.story),
    questionCount: piece.quiz.length,
    story: oneLine(piece.story),
    quiz,
  });
  return createHash('sha256').update(body).digest('hex');
}

export function uuidFromHash(hash) {
  const hex = hash.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function validatePiece(piece, file = '') {
  const problems = [];
  const where = file || piece?.title || 'piece';
  if (!piece || typeof piece !== 'object') return [`${where}: not an object`];
  if (!['B1', 'B2', 'C1'].includes(piece.level)) problems.push(`${where}: level must be B1, B2, or C1`);
  if (!TOPICS.includes(piece.topic)) problems.push(`${where}: unknown topic ${piece.topic}`);
  const title = String(piece.title ?? '').trim();
  if (title.length < 8 || title.length > 80) problems.push(`${where}: title length`);
  if (/copyright|all rights reserved|reprinted from/i.test(title)) problems.push(`${where}: title looks borrowed`);
  const story = String(piece.story ?? '').trim();
  const words = countWords(story);
  const [min, max] = WORD_BOUNDS[piece.level] ?? [0, 0];
  if (words < min || words > max) problems.push(`${where}: ${words} words, need ${min}-${max}`);
  if (story.includes('\n\n\n')) problems.push(`${where}: too many blank lines`);
  const quiz = Array.isArray(piece.quiz) ? piece.quiz : [];
  if (quiz.length !== 5) problems.push(`${where}: need 5 questions, got ${quiz.length}`);
  const sentences = story.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  quiz.forEach((item, index) => {
    const label = `${where} Q${index + 1}`;
    const options = Array.isArray(item?.options) ? item.options.map((option) => String(option).trim()) : [];
    if (options.length !== 4 || new Set(options.map((option) => option.toLowerCase())).size !== 4) {
      problems.push(`${label}: need 4 different options`);
    }
    if (options.some((option) => /^[A-D][\.\)\:]/.test(option) || /all of the above|none of the above/i.test(option))) {
      problems.push(`${label}: labelled or collective option`);
    }
    const answer = String(item?.correctAnswer ?? '').trim();
    if (!options.includes(answer)) problems.push(`${label}: correctAnswer is not an option`);
    if (!String(item?.explanation ?? '').trim()) problems.push(`${label}: missing explanation`);
    if (!SKILLS.has(item?.skill)) problems.push(`${label}: skill`);
    const support = String(item?.supportingSentence ?? '').trim();
    if (!support || !story.includes(support)) problems.push(`${label}: supporting sentence is not in the text`);
    if (support && !sentences.includes(support)) problems.push(`${label}: supporting sentence is not one full sentence`);
    const question = String(item?.question ?? '').trim();
    if (question.length < 12) problems.push(`${label}: question too short`);
    if (answer && question.toLowerCase().includes(answer.toLowerCase())) problems.push(`${label}: question contains the answer`);
  });
  const vocabulary = Array.isArray(piece.vocabulary) ? piece.vocabulary : [];
  if (vocabulary.length < 6) problems.push(`${where}: need at least 6 vocabulary items`);
  const storyLower = story.toLowerCase();
  for (const item of vocabulary) {
    const word = String(item?.word ?? '').trim();
    if (!word || !String(item?.definition ?? '').trim()) problems.push(`${where}: empty vocabulary item`);
    else if (!storyLower.includes(word.toLowerCase())) problems.push(`${where}: vocabulary "${word}" is not in the text`);
  }
  return problems;
}

export async function loadPieces(root) {
  const pieces = [];
  for (const level of ['B1', 'B2', 'C1']) {
    const dir = path.join(root, level);
    let names = [];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const piece of list) pieces.push({ ...piece, file: path.relative(root, file) });
    }
  }
  return pieces;
}

function mixOptions(options, seedText) {
  const list = options.slice();
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  for (let index = list.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    const hold = list[index];
    list[index] = list[swap];
    list[swap] = hold;
  }
  return list;
}

export function bankRow(piece) {
  const wordCount = countWords(piece.story);
  const hash = readingContentHash(piece);
  const payload = {
    mode: 'reading',
    level: piece.level,
    format: 'text',
    topic: TOPIC_LABELS[piece.topic],
    title: piece.title.trim(),
    story: piece.story.trim(),
    dialogue: [],
    vocabulary: piece.vocabulary.map((item) => ({
      word: String(item.word).trim(),
      definition: String(item.definition).trim(),
    })),
    quiz: piece.quiz.map((item, index) => {
      const correctAnswer = item.correctAnswer.trim();
      const options = item.options.map((option) => option.trim());
      return {
        question: item.question.trim(),
        options: mixOptions(options, `${hash}:${index}`),
        correctAnswer,
        explanation: item.explanation.trim(),
        supportingSentence: item.supportingSentence.trim(),
        skill: item.skill,
      };
    }),
    wordCount,
    questionCount: 5,
  };
  return {
    id: uuidFromHash(hash),
    hash,
    level: piece.level,
    title: payload.title,
    topic: piece.topic,
    wordCount,
    payload,
    dimensions: { topic: piece.topic, wordCount, questionCount: 5 },
  };
}
