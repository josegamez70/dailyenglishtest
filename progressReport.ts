import { countPhrase } from './academyStats';
import { formatResultDate, lessonModeLabel, localDayKey } from './progressStats';
import {
  activityDays,
  badgeLevel,
  grammarSubtype,
  levelBreakdown,
  levelEmptyMessage,
  newestFirst,
  recentTestWhen,
  savedLevelLabel,
  scorePercent,
  skillAverage,
  SKILLS,
  type ActivityDay,
  type DetailTest,
} from './studentDetail';

export type ReportTest = {
  createdAt: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: string | null;
};

export function reportTestFromResult(row: {
  createdAt?: string;
  created_at?: string;
  level: string;
  topic: string;
  title: string;
  score: number;
  total: number;
  mode: string | null;
}): ReportTest {
  return {
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    level: row.level,
    topic: row.topic,
    title: row.title,
    score: row.score,
    total: row.total,
    mode: row.mode,
  };
}

export type SkillLine = {
  label: string;
  average: string;
};

export type LevelSection = {
  skill: string;
  empty: string | null;
  rows: { label: string; detail: string }[];
};

export type RecentLine = {
  when: string;
  tags: string;
  score: string;
  title: string;
};

export type ProgressReport = {
  studentName: string;
  level: string;
  generatedAtLabel: string;
  skills: SkillLine[];
  levels: LevelSection[];
  activitySummary: string;
  activity: ActivityDay[];
  recent: RecentLine[];
  filename: string;
};

export function activitySummary(days: ActivityDay[]): string {
  const scored = days.filter((day) => day.percent != null);
  if (!scored.length) return 'No tests in the last 14 days.';
  return `${countPhrase(scored.length, 'day')} with a test in the last 14 days.`;
}

export function progressPdfFilename(name: string, when: Date): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `progress-${slug || 'student'}-${localDayKey(when)}.pdf`;
}

function percentLabel(value: number | null): string {
  return value == null ? '—' : `${value}%`;
}

function toDetail(tests: ReportTest[]): DetailTest[] {
  return tests.map((test) => ({
    createdAt: test.createdAt,
    level: test.level,
    topic: test.topic,
    title: test.title,
    score: test.score,
    total: test.total,
    mode: test.mode,
  }));
}

export function buildProgressReport(input: {
  studentName: string;
  profileLevel?: string | null;
  tests: ReportTest[];
  generatedAt?: Date;
}): ProgressReport {
  const generatedAt = input.generatedAt ?? new Date();
  const studentName = input.studentName.trim() || 'Student';
  const tests = newestFirst(input.tests);
  const detail = toDetail(tests);
  const activity = activityDays(detail, generatedAt);
  return {
    studentName,
    level: badgeLevel(input.profileLevel, detail),
    generatedAtLabel: formatResultDate(generatedAt),
    skills: SKILLS.map((skill) => ({
      label: skill.label,
      average: percentLabel(skillAverage(detail, skill.id)),
    })),
    levels: SKILLS.map((skill) => ({
      skill: skill.label,
      empty: levelEmptyMessage(detail, skill.id),
      rows: levelBreakdown(detail, skill.id).map((row) => ({
        label: row.label,
        detail: `${percentLabel(row.average)} · ${countPhrase(row.count, 'test')}`,
      })),
    })),
    activitySummary: activitySummary(activity),
    activity,
    recent: tests.map((test) => {
      const when = recentTestWhen(test.createdAt);
      const subtype = grammarSubtype(test);
      const tags = [lessonModeLabel(test.mode), subtype, savedLevelLabel(test.level)].filter(Boolean).join(' · ');
      return {
        when: [when.date, when.time].filter(Boolean).join(', '),
        tags,
        score: percentLabel(scorePercent(test.score, test.total)),
        title: (test.title || test.topic).trim(),
      };
    }),
    filename: progressPdfFilename(studentName, generatedAt),
  };
}
