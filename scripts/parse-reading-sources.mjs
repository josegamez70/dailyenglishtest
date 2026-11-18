import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { countWords, validatePiece } from './reading-bank-lib.mjs';

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseBlock(block, file) {
  const lines = block.split('\n').map((line) => line.trimEnd());
  const meta = {};
  let i = 0;
  while (i < lines.length && lines[i].includes(':')) {
    const [key, ...rest] = lines[i].split(':');
    if (!['level', 'topic', 'title'].includes(key.trim())) break;
    meta[key.trim()] = rest.join(':').trim();
    i += 1;
  }
  const body = lines.slice(i).join('\n');
  const story = body.split(/^VOCAB\s*$/m)[0].replace(/^STORY\s*$/m, '').trim();
  const afterVocab = body.split(/^VOCAB\s*$/m)[1] || '';
  const vocabPart = afterVocab.split(/^QUIZ\s*$/m)[0] || '';
  const quizPart = afterVocab.split(/^QUIZ\s*$/m)[1] || '';
  const vocabulary = vocabPart.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [word, definition] = line.split('|').map((part) => part.trim());
    return { word, definition };
  });
  const quiz = quizPart.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [question, correct, wrong1, wrong2, wrong3, explanation, supportingSentence, skill] = line.split('|').map((part) => part.trim());
    return {
      question,
      options: [correct, wrong1, wrong2, wrong3],
      correctAnswer: correct,
      explanation,
      supportingSentence,
      skill,
    };
  });
  return { ...meta, story, vocabulary, quiz, file };
}

const srcDir = path.resolve('data/reading-bank/src');
const names = (process.argv.slice(2).length ? process.argv.slice(2) : (await readdir(srcDir)).filter((name) => name.endsWith('.txt'))).sort();
let problems = 0;
let count = 0;
for (const name of names) {
  const sourcePath = name.includes('/') || name.includes('\\') ? path.resolve(name) : path.join(srcDir, name);
  const raw = await readFile(sourcePath, 'utf8');
  const blocks = raw.split(/^===\s*$/m).map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const piece = parseBlock(block, name);
    const found = validatePiece(piece, `${name}:${piece.title}`);
    if (found.length) {
      problems += found.length;
      console.error(found.slice(0, 6).join('\n'));
      console.error('words', countWords(piece.story), piece.title);
    }
    const dir = path.resolve('data/reading-bank', piece.level);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${slug(piece.title)}.json`), `${JSON.stringify(piece, null, 2)}\n`);
    count += 1;
  }
}
console.log({ count, problems });
if (problems) process.exit(1);
