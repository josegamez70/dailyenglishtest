import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bankRow, loadPieces, validatePiece } from './reading-bank-lib.mjs';

const root = path.resolve('data/reading-bank');
const pieces = await loadPieces(root);
const problems = [];
const titles = new Set();
const hashes = new Set();
const rows = [];
for (const piece of pieces) {
  problems.push(...validatePiece(piece, piece.file));
  const key = `${piece.level}\0${String(piece.title).trim().toLowerCase()}`;
  if (titles.has(key)) problems.push(`${piece.file}: duplicate title`);
  titles.add(key);
  if (!problems.length) {
    const row = bankRow(piece);
    if (hashes.has(row.hash)) problems.push(`${piece.file}: duplicate content hash`);
    hashes.add(row.hash);
    rows.push(row);
  }
}
if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  console.error(`problems ${problems.length}, pieces ${pieces.length}`);
  process.exit(1);
}
const counts = { B1: 0, B2: 0, C1: 0 };
for (const row of rows) counts[row.level] += 1;

function quote(value) {
  const tag = `rb${createTag(value)}`;
  return `$${tag}$${value}$${tag}$`;
}
function createTag(value) {
  let n = 0;
  for (const char of value) n = (n + char.charCodeAt(0)) % 100000;
  let tag = `q${n}`;
  while (value.includes(`$${tag}$`)) tag += 'x';
  return tag;
}

const inserts = rows.map((row) => `insert into public.exercise_bank (
  id, kind, level, exercise_type, dimensions, payload, content_hash, active
) values (
  '${row.id}'::uuid,
  'reading',
  '${row.level}',
  'text',
  ${quote(JSON.stringify(row.dimensions))}::jsonb,
  ${quote(JSON.stringify(row.payload))}::jsonb,
  '${row.hash}',
  true
) on conflict (content_hash) do nothing;`).join('\n\n');

const sql = `-- Frozen reading bank for a future daily challenge. Not applied by this pull request.
-- One row is one complete text lesson: story, six or more glossary items, and five quiz questions.
-- Answers stay in payload. Clients cannot read exercise_bank.
-- A later challenge, per profile level, will freeze one whole reading row, one whole listening row,
-- and one whole grammar set for the Europe/Madrid date. This file does not serve them yet.
-- B1 ${counts.B1}, B2 ${counts.B2}, C1 ${counts.C1}.

alter table public.exercise_bank drop constraint if exists exercise_bank_reading_slot_check;
alter table public.exercise_bank add constraint exercise_bank_reading_slot_check check (
  kind <> 'reading'
  or (
    level in ('B1', 'B2', 'C1')
    and exercise_type = 'text'
    and payload->>'mode' = 'reading'
    and payload->>'level' = level
    and payload->>'format' = 'text'
    and coalesce(payload->>'title', '') <> ''
    and coalesce(payload->>'story', '') <> ''
    and dimensions->>'topic' in (
      'daily life', 'school_college', 'travel', 'hobbies', 'health_sports', 'culture_food',
      'technology', 'science', 'economy_finance', 'mystery', 'adventure', 'fantasy'
    )
    and dimensions->>'questionCount' = '5'
    and case
      when jsonb_typeof(payload->'quiz') = 'array' then jsonb_array_length(payload->'quiz') = 5
      else false
    end
    and (
      (level = 'B1' and (dimensions->>'wordCount')::int between 200 and 250)
      or (level = 'B2' and (dimensions->>'wordCount')::int between 300 and 350)
      or (level = 'C1' and (dimensions->>'wordCount')::int between 400 and 450)
    )
  )
);

${inserts}
`;

const out = path.resolve('supabase/migrations/20261127_reading_bank.sql');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, sql);
console.log(JSON.stringify(counts));
