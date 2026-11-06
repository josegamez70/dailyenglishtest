import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressReport, progressPdfFilename, reportTestFromResult, type ReportTest } from '../progressReport.ts';

function lesson(partial: Partial<ReportTest> & Pick<ReportTest, 'mode' | 'score' | 'total'>): ReportTest {
  return {
    createdAt: partial.createdAt ?? '2026-11-05T10:00:00.000Z',
    level: partial.level ?? 'B1',
    topic: partial.topic ?? 'Daily Life',
    title: partial.title ?? 'Daily Life',
    ...partial,
  };
}

test('the progress report uses the panel averages, level, and grammar subtype', () => {
  const generatedAt = new Date(2026, 10, 6, 11, 28);
  const report = buildProgressReport({
    studentName: ' Might R ',
    profileLevel: 'C2',
    generatedAt,
    tests: [
      lesson({ mode: 'reading', level: 'Intermediate', score: 3, total: 5, createdAt: new Date(2026, 10, 5, 9).toISOString() }),
      lesson({ mode: 'listening', level: 'B2', score: 3, total: 5, createdAt: new Date(2026, 10, 2, 12).toISOString() }),
      lesson({
        mode: 'grammar',
        level: 'B1',
        score: 4,
        total: 5,
        title: 'Grammar: Phrasal verbs',
        topic: 'travel',
        createdAt: new Date(2026, 10, 5, 18).toISOString(),
      }),
    ],
  });
  assert.equal(report.studentName, 'Might R');
  assert.equal(report.level, 'C2');
  assert.deepEqual(report.skills, [
    { label: 'Reading', average: '60%' },
    { label: 'Listening', average: '60%' },
    { label: 'Grammar', average: '80%' },
  ]);
  const grammar = report.levels.find((section) => section.skill === 'Grammar');
  assert.equal(grammar?.empty, null);
  assert.deepEqual(grammar?.rows, [{ label: 'B1', detail: '80% · 1 test' }]);
  assert.match(report.activitySummary, /2 days with a test/);
  assert.equal(report.recent[0].tags, 'Grammar · Phrasal · B1');
  assert.equal(report.recent[0].score, '80%');
  assert.equal(report.recent[0].title, 'Grammar: Phrasal verbs');
  assert.equal(report.filename, 'progress-might-r-2026-11-06.pdf');
});

test('an empty report still names the student and says there is no activity', () => {
  const generatedAt = new Date(2026, 10, 6, 8, 0);
  const report = buildProgressReport({
    studentName: '   ',
    profileLevel: '',
    tests: [],
    generatedAt,
  });
  assert.equal(report.studentName, 'Student');
  assert.equal(report.level, '');
  assert.deepEqual(report.skills.map((skill) => skill.average), ['—', '—', '—']);
  assert.equal(report.levels[0].empty, 'No tests for this skill.');
  assert.equal(report.activitySummary, 'No tests in the last 14 days.');
  assert.equal(report.recent.length, 0);
  assert.equal(progressPdfFilename('José María', generatedAt), 'progress-jose-maria-2026-11-06.pdf');
  assert.equal(reportTestFromResult({
    created_at: '2026-11-01T00:00:00.000Z',
    level: 'A2',
    topic: 'Hobbies',
    title: 'Hobbies',
    score: 1,
    total: 2,
    mode: 'reading',
  }).createdAt, '2026-11-01T00:00:00.000Z');
});
