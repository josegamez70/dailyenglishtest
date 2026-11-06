import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildProgressReport, type ReportTest } from '../progressReport.ts';
import { recentTestsThatFit, renderProgressPdf } from '../progressPdf.ts';

test('the progress PDF is a real file and standard fonts keep Spanish names', async () => {
  const generatedAt = new Date(2026, 10, 6, 11, 28);
  const tests: ReportTest[] = [
    {
      createdAt: new Date(2026, 10, 5, 18).toISOString(),
      level: 'B1',
      topic: 'travel',
      title: 'Grammar: Phrasal verbs',
      score: 4,
      total: 5,
      mode: 'grammar',
    },
    {
      createdAt: new Date(2026, 10, 5, 9).toISOString(),
      level: 'Intermediate',
      topic: 'Daily Life',
      title: 'Daily Life',
      score: 9,
      total: 10,
      mode: 'reading',
    },
  ];
  const report = buildProgressReport({
    studentName: 'José María',
    profileLevel: 'C2',
    tests,
    generatedAt,
  });
  const bytes = await renderProgressPdf(report);
  assert.equal(bytes[0], 0x25);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x44);
  assert.equal(bytes[3], 0x46);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getTitle(), 'José María progress report');
  assert.equal(doc.getPageCount(), 1);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.ok(font.widthOfTextAtSize('José María — 90%', 12) > 0);
  assert.equal(report.recent[0].tags, 'Grammar · Phrasal · B1');
});

test('a full level breakdown and a long test list still fit on one page', async () => {
  const generatedAt = new Date(2026, 10, 6, 11, 28);
  const levels = ['A1', 'A2', 'Beginner', 'B1', 'Intermediate', 'B2', 'C1', 'Advanced', 'C2'];
  const modes = ['reading', 'listening', 'grammar'] as const;
  const tests: ReportTest[] = modes.flatMap((mode) => levels.map((level, index) => ({
    createdAt: new Date(2026, 10, 1 + (index % 6), 8 + index).toISOString(),
    level,
    topic: 'Daily Life',
    title: mode === 'grammar' && level === 'B1' ? 'Grammar: Phrasal verbs' : 'Daily Life',
    score: 7,
    total: 10,
    mode,
  })));
  for (let index = 0; index < 24; index += 1) {
    tests.push({
      createdAt: new Date(2026, 10, 6, 18, index).toISOString(),
      level: 'B2',
      topic: 'Hobbies',
      title: index % 2 === 0 ? 'Grammar: Fill in the blanks' : 'A long lesson title about travelling across the city',
      score: 8,
      total: 10,
      mode: index % 2 === 0 ? 'grammar' : 'listening',
    });
  }
  const report = buildProgressReport({
    studentName: 'José María de los Santos',
    profileLevel: 'C2',
    tests,
    generatedAt,
  });
  const bytes = await renderProgressPdf(report);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(recentTestsThatFit(5, 50, 10, 10), 5);
  assert.equal(recentTestsThatFit(5, 45, 10, 10), 3);
  assert.equal(recentTestsThatFit(0, 100, 10, 10), 0);
  assert.equal(recentTestsThatFit(4, 9, 10, 10), 0);
});
