import { AppShell } from './AppShell';
import { SavedLessonsPage } from './SavedLessonsPage';
import { TasksPage } from './TasksPage';
import type { TaskPackClient } from '../taskStore';
import { taskReminderMessage, type PracticePiece, type TaskSettings } from '../tasks';
import type { SavedLessonRow } from '../studyStore';

const settings: TaskSettings = {
  enabled: true,
  emailReminders: true,
  frequency: 'daily',
  level: 'beginner',
  topic: 'daily life',
  wordCount: 100,
  questionCount: 5,
  readingFormat: 'text',
  listeningFormat: 'dialogue',
  grammarLevel: 'B1',
  grammarExercise: 'blanks',
  grammarTopic: 'travel',
};

const reading: PracticePiece = {
  story: 'Anna walks to the market every morning and buys fresh bread for her family.',
  quiz: [{ question: 'Where does Anna go?' }],
  vocabulary: [],
  dialogue: [],
  format: 'text',
  level: 'beginner',
  levelLabel: 'Beginner',
  topic: 'Daily Life',
  title: 'Daily Life',
  speakers: [],
  wordCount: 100,
  questionCount: 5,
};

const listening: PracticePiece = {
  story: 'Sophie: What time is the train?\nEmma: It leaves at eight.',
  quiz: [{ question: 'What time is the train?' }],
  vocabulary: [],
  dialogue: [
    { speaker: 'Sophie', line: 'What time is the train?', gender: 'female' },
    { speaker: 'Emma', line: 'It leaves at eight.', gender: 'female' },
  ],
  format: 'dialogue',
  level: 'beginner',
  levelLabel: 'Beginner',
  topic: 'Travel',
  title: 'Travel',
  speakers: [
    { name: 'Sophie', gender: 'female' },
    { name: 'Emma', gender: 'female' },
  ],
  wordCount: 100,
  questionCount: 5,
};

const pack: TaskPackClient = {
  id: 'preview-pack',
  periodKey: '2026-11-11',
  status: 'ready',
  blockReason: '',
  readingDone: false,
  listeningDone: true,
  grammarDone: false,
  reading,
  listening,
  grammar: {
    level: 'B1',
    exercise: 'blanks',
    topic: 'travel',
    title: 'Grammar: Fill in the blanks',
    items: [{ kind: 'choice', prompt: 'She _____ the train.' }],
  },
};

const savedRows: SavedLessonRow[] = [
  {
    id: 'task-reading',
    created_at: '2026-11-11T08:00:00.000Z',
    title: 'Daily Life',
    lesson: { mode: 'reading', format: 'text', level: 'beginner', levelLabel: 'Beginner', task: true, story: reading.story },
  },
  {
    id: 'task-listening',
    created_at: '2026-11-11T08:05:00.000Z',
    title: 'Travel',
    lesson: { mode: 'listening', format: 'dialogue', level: 'beginner', levelLabel: 'Beginner', task: true },
  },
  {
    id: 'task-grammar',
    created_at: '2026-11-11T08:10:00.000Z',
    title: 'Grammar: Fill in the blanks',
    lesson: { mode: 'grammar', exercise: 'blanks', level: 'B1', levelLabel: 'B1', task: true },
  },
  {
    id: 'plain-reading',
    created_at: '2026-11-10T08:00:00.000Z',
    title: 'School trip',
    lesson: { mode: 'reading', format: 'text', level: 'intermediate', levelLabel: 'Intermediate' },
  },
];

const mail = taskReminderMessage({
  baseUrl: 'https://dailyenglishtest.es',
  token: 'abc123abc123abc123abc123abc123ab',
  frequency: 'daily',
  periodKey: '2026-11-11',
});

export function TasksPreview({
  scene,
}: {
  scene: 'tasks' | 'saved' | 'email';
}) {
  return (
    <AppShell
      active={scene === 'saved' ? 'saved' : 'tasks'}
      onNavigate={() => undefined}
      onSignOut={() => undefined}
      email="student@example.com"
      status="Free lessons left: 2 of 3"
      showAcademy={false}
      academyName="North Academy"
      academyRole="student"
      displayName="Ana"
    >
      {scene === 'tasks' && (
        <TasksPage
          userId="preview-user"
          fixture={{ settings, pack }}
          onOpenReading={() => undefined}
          onOpenListening={() => undefined}
          onOpenGrammar={() => undefined}
        />
      )}
      {scene === 'saved' && (
        <SavedLessonsPage
          initialRows={savedRows}
          onOpen={() => undefined}
          onCreate={() => undefined}
          onPracticeGrammar={() => undefined}
        />
      )}
      {scene === 'email' && (
        <div>
          <h1 className="text-2xl font-bold">Reminder email</h1>
          <p className="mt-2 text-base">This is the message a learner receives when a pack is ready.</p>
          <iframe title="Task reminder email" className="mt-4 h-[640px] w-full rounded-xl border border-slate-300 bg-white" srcDoc={mail.html} />
        </div>
      )}
    </AppShell>
  );
}
