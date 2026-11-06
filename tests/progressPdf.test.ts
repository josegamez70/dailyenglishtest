import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildProgressReport, type ReportTest } from '../progressReport.ts';
import { renderProgressPdf } from '../progressPdf.ts';

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
  assert.ok(doc.getPageCount() >= 1);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.ok(font.widthOfTextAtSize('José María — 90%', 12) > 0);
  assert.equal(report.recent[0].tags, 'Grammar · Phrasal · B1');
});
