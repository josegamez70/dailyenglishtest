import { createHash } from 'node:crypto';
import { buildListeningSsml, type ListeningSpeech } from './azureSpeech.ts';
import { speakerFromName, type DialogueTurn, type SpeakerGender } from './dialogue.ts';
import { isListeningAudioPath, listeningAudioPath } from './exerciseBank.ts';

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function turnFrom(speakerRaw: unknown, lineRaw: unknown, genderRaw: unknown): DialogueTurn | null {
  const listed = speakerFromName(clean(speakerRaw));
  const speaker = listed?.name ?? clean(speakerRaw).replace(/[*_`]/g, '').replace(/:$/, '').trim();
  const line = clean(lineRaw);
  if (!speaker || !line) return null;
  const gender: SpeakerGender = listed?.gender ?? (genderRaw === 'male' ? 'male' : 'female');
  return { speaker, line, gender };
}

function turnsFromLines(story: string): DialogueTurn[] {
  const turns: DialogueTurn[] = [];
  for (const row of story.split(/\n+/)) {
    const match = row.replace(/[*_`]/g, '').trim().match(/^(.*?):\s*(\S.*)$/);
    if (!match) continue;
    const turn = turnFrom(match[1], match[2], null);
    if (turn) turns.push(turn);
  }
  return turns;
}

/** The words Azure should speak for a saved listening lesson. Names keep their list gender. */
export function savedListeningSpeech(lesson: Record<string, unknown>): ListeningSpeech | null {
  const format = lesson.format === 'dialogue' ? 'dialogue' : 'text';
  const story = String(lesson.story ?? '').trim();
  if (format === 'text') {
    if (!clean(story)) return null;
    return { format: 'text', story, dialogue: [] };
  }
  const fromField = Array.isArray(lesson.dialogue)
    ? lesson.dialogue.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const turn = turnFrom(record.speaker ?? record.name, record.line ?? record.text, record.gender);
      return turn ? [turn] : [];
    })
    : [];
  const dialogue = fromField.length ? fromField : turnsFromLines(story);
  if (!dialogue.length) return null;
  return { format: 'dialogue', story, dialogue };
}

/** Same spoken ssml is the same private-bucket object, so a replay does not synthesize again. */
export function savedListeningCachePath(
  speech: ListeningSpeech,
  pace?: { profileSpeed?: number; slow?: boolean },
): string {
  const built = buildListeningSsml(speech, pace);
  const hash = createHash('sha256').update(built.ssml).digest('hex');
  return listeningAudioPath(hash);
}

export function storedSavedAudioPath(
  lesson: Record<string, unknown>,
  speech: ListeningSpeech,
  pace?: { profileSpeed?: number; slow?: boolean },
): string | null {
  const key = pace?.slow ? 'audioSlowPath' : 'audioPath';
  const path = typeof lesson[key] === 'string' ? lesson[key] : '';
  if (!path || !isListeningAudioPath(path)) return null;
  return path === savedListeningCachePath(speech, pace) ? path : null;
}
