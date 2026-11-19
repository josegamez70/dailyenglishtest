import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bankRow, loadPieces, readingContentHash, validatePiece } from './reading-bank-lib.mjs';

async function walkJson(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkJson(full));
    else if (entry.name.endsWith('.json')) files.push(full);
  }
  return files.sort();
}

const SHORT_BOUNDS = {
  60: [54, 66],
  100: [90, 110],
  140: [126, 154],
};

const root = path.resolve('data/reading-bank-short');
const longRoot = path.resolve('data/reading-bank');
const pieces = [];
for (const file of await walkJson(root)) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  pieces.push({ ...parsed, file: path.relative(root, file) });
}
const longPieces = await loadPieces(longRoot);
const problems = [];
const titles = new Set(longPieces.map((piece) => `${piece.level}\0${String(piece.title).trim().toLowerCase()}`));
const hashes = new Set(longPieces.map((piece) => readingContentHash(piece)));
const counts = {};

for (const piece of pieces) {
  const target = Number(piece.target);
  const bounds = SHORT_BOUNDS[target];
  const where = piece.file || piece.title;
  if (!bounds) problems.push(`${where}: target must be 60, 100, or 140`);
  const saved = validatePiece.length;
  const local = validatePiece({ ...piece }, where).filter((problem) => !problem.includes('words, need'));
  problems.push(...local);
  const words = String(piece.story ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (bounds && (words < bounds[0] || words > bounds[1])) {
    problems.push(`${where}: ${words} words, need ${bounds[0]}-${bounds[1]} for target ${target}`);
  }
  if (String(piece.story ?? '').includes('\n\n')) problems.push(`${where}: short pieces stay one paragraph`);
  const detail = (piece.quiz ?? []).filter((item) => item.skill === 'detail').length;
  if (piece.level === 'C1' && detail > 2) problems.push(`${where}: C1 detail questions must be the minority`);
  if (piece.level === 'B2' && detail === (piece.quiz ?? []).length) problems.push(`${where}: B2 needs an inference question`);
  const key = `${piece.level}\0${String(piece.title).trim().toLowerCase()}`;
  if (titles.has(key)) problems.push(`${where}: duplicate title`);
  titles.add(key);
  const hash = readingContentHash(piece);
  if (hashes.has(hash)) problems.push(`${where}: duplicate content hash`);
  hashes.add(hash);
  counts[`${piece.level}-${target}`] = (counts[`${piece.level}-${target}`] ?? 0) + 1;
  void saved;
}

if (problems.length) {
  console.error(problems.slice(0, 80).join('\n'));
  console.error(`problems ${problems.length}, pieces ${pieces.length}`);
  process.exit(1);
}

const rows = pieces.map((piece) => bankRow(piece));
function quote(value) {
  let n = 0;
  for (const char of value) n = (n + char.charCodeAt(0)) % 100000;
  let tag = `q${n}`;
  while (value.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${value}$${tag}$`;
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

const sql = `-- Short reading pieces for the 60, 100, and 140 word practice menu.
-- A piece is used only when its stored length is within 20 percent of the request.
-- The daily challenge still indexes only readings of 200 words or more, so today and tomorrow stay put.
-- Not applied by this pull request. Run it in Supabase after it is approved.
-- Counts: ${Object.entries(counts).sort().map(([key, count]) => `${key} ${count}`).join(', ')}.

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
      or ((dimensions->>'wordCount')::int between 54 and 66)
      or ((dimensions->>'wordCount')::int between 90 and 110)
      or ((dimensions->>'wordCount')::int between 126 and 154)
    )
  )
);

create or replace function public.claim_reading_bank_item(
  uid uuid,
  reading_level text,
  reading_topic text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  chosen uuid;
  body jsonb;
begin
  if uid is null or reading_level not in ('B1', 'B2', 'C1') then
    return jsonb_build_object('status', 'empty');
  end if;

  select b.id, b.payload
    into chosen, body
  from public.exercise_bank b
  where b.kind = 'reading'
    and b.active
    and b.level = reading_level
    and (
      coalesce(reading_topic, '') = ''
      or b.dimensions->>'topic' = reading_topic
    )
    and not exists (
      select 1 from public.exercise_bank_serves s
      where s.user_id = uid and s.exercise_id = b.id
    )
    and not exists (
      select 1
      from (
        select ((timezone('Europe/Madrid', now()))::date + offs.n)::text as day
        from (values (0), (1)) as offs(n)
      ) days
      join (
        select
          row.id,
          row_number() over (order by row.content_hash) - 1 as idx,
          count(*) over () as n
        from public.exercise_bank row
        where row.kind = 'reading'
          and row.active
          and row.level = reading_level
          and coalesce((row.dimensions->>'wordCount')::int, 0) >= 200
      ) pool
        on pool.idx = mod(
          ('x' || substr(md5(days.day || '|' || reading_level || '|reading'), 1, 8))::bit(32)::bigint,
          pool.n
        )
      where pool.id = b.id
    )
  order by random()
  limit 1
  for update of b skip locked;

  if chosen is null then
    return jsonb_build_object('status', 'empty');
  end if;

  insert into public.exercise_bank_serves (user_id, exercise_id)
  values (uid, chosen);
  return jsonb_build_object('status', 'ok', 'id', chosen, 'payload', body);
exception
  when unique_violation then
    return jsonb_build_object('status', 'conflict');
end;
$$;

create or replace function public.claim_reading_bank_for_length(
  uid uuid,
  reading_level text,
  reading_topic text,
  min_words integer,
  max_words integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  chosen uuid;
  body jsonb;
begin
  if uid is null or reading_level not in ('B1', 'B2', 'C1') or min_words is null or max_words is null or min_words > max_words then
    return jsonb_build_object('status', 'empty');
  end if;

  select b.id, b.payload
    into chosen, body
  from public.exercise_bank b
  where b.kind = 'reading'
    and b.active
    and b.level = reading_level
    and coalesce((b.dimensions->>'wordCount')::int, 0) between min_words and max_words
    and coalesce(b.dimensions->>'questionCount', '5') = '5'
    and (
      coalesce(reading_topic, '') = ''
      or b.dimensions->>'topic' = reading_topic
    )
    and not exists (
      select 1 from public.exercise_bank_serves s
      where s.user_id = uid and s.exercise_id = b.id
    )
    and not exists (
      select 1
      from (
        select ((timezone('Europe/Madrid', now()))::date + offs.n)::text as day
        from (values (0), (1)) as offs(n)
      ) days
      join (
        select
          row.id,
          row_number() over (order by row.content_hash) - 1 as idx,
          count(*) over () as n
        from public.exercise_bank row
        where row.kind = 'reading'
          and row.active
          and row.level = reading_level
          and coalesce((row.dimensions->>'wordCount')::int, 0) >= 200
      ) pool
        on pool.idx = mod(
          ('x' || substr(md5(days.day || '|' || reading_level || '|reading'), 1, 8))::bit(32)::bigint,
          pool.n
        )
      where pool.id = b.id
    )
  order by random()
  limit 1
  for update of b skip locked;

  if chosen is null then
    return jsonb_build_object('status', 'empty');
  end if;

  insert into public.exercise_bank_serves (user_id, exercise_id)
  values (uid, chosen);
  return jsonb_build_object('status', 'ok', 'id', chosen, 'payload', body);
exception
  when unique_violation then
    return jsonb_build_object('status', 'conflict');
end;
$$;

revoke all on function public.claim_reading_bank_item(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_reading_bank_item(uuid, text, text) to service_role;
revoke all on function public.claim_reading_bank_for_length(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_reading_bank_for_length(uuid, text, text, integer, integer) to service_role;

${inserts}
`;

const out = path.resolve('supabase/migrations/20261202_reading_bank_short.sql');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, sql);
console.log(JSON.stringify({ pieces: pieces.length, counts }, null, 2));
