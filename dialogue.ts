export type ContentFormat = 'text' | 'dialogue';

export type DialogueTurn = {
  speaker: string;
  line: string;
};

export type SpeechLine = {
  speaker: string;
  speakerIndex: number;
  text: string;
  turnIndex: number;
};

export type SpeakerVoice = {
  name: string;
  lang: string;
  pitch: number;
  rateScale: number;
};

export function normalizeFormat(value: unknown): ContentFormat {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'dialogue' || text === 'dialog' ? 'dialogue' : 'text';
}

function cleanLine(speaker: string, line: string): string {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  const prefix = speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`^${prefix}\\s*:\\s*`, 'i'), '').trim();
}

export function parseDialogue(raw: unknown): DialogueTurn[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const speaker = String(record.speaker ?? record.name ?? '').replace(/\s+/g, ' ').trim();
      const line = cleanLine(speaker, String(record.line ?? record.text ?? ''));
      if (!speaker || !line || speaker.length > 40 || speaker.includes(':')) return [];
      return [{ speaker, line }];
    });
  }
  if (typeof raw !== 'string') return [];
  const turns: DialogueTurn[] = [];
  for (const row of raw.split(/\n+/)) {
    const match = row.trim().match(/^([^:\n]{1,40}):\s+(\S.*)$/);
    if (!match) continue;
    const speaker = match[1].trim();
    const line = cleanLine(speaker, match[2]);
    if (speaker && line) turns.push({ speaker, line });
  }
  return turns;
}

export function renderDialogue(turns: DialogueTurn[]): string {
  return turns.map((turn) => `${turn.speaker}: ${turn.line}`).join('\n');
}

export function dialogueSpeakers(turns: DialogueTurn[]): string[] {
  const names: string[] = [];
  for (const turn of turns) {
    if (!names.some((name) => name.toLowerCase() === turn.speaker.toLowerCase())) names.push(turn.speaker);
  }
  return names;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function spokenWordCount(turns: DialogueTurn[]): number {
  return countWords(turns.map((turn) => turn.line).join(' '));
}

export function contentWordCount(text: string, format: ContentFormat): number {
  if (format !== 'dialogue') return countWords(text);
  const turns = parseDialogue(text);
  if (!turns.length) return countWords(text);
  return spokenWordCount(turns);
}

export function isContentLengthOk(text: string, format: ContentFormat, target: number): boolean {
  const count = contentWordCount(text, format);
  const safe = Math.max(1, Math.round(target));
  const min = Math.floor(safe * 0.85);
  const max = Math.ceil(safe * 1.15);
  return count >= min && count <= max;
}

export function speechLines(turns: DialogueTurn[]): SpeechLine[] {
  const names = dialogueSpeakers(turns);
  return turns.map((turn, turnIndex) => ({
    speaker: turn.speaker,
    speakerIndex: Math.max(0, names.findIndex((name) => name.toLowerCase() === turn.speaker.toLowerCase())),
    text: `${turn.speaker}. ${turn.line}`,
    turnIndex,
  }));
}

export function resumeTurnIndex(durations: number[], elapsedMs: number): number {
  if (durations.length === 0) return 0;
  let cursor = 0;
  for (let index = 0; index < durations.length; index++) {
    if (elapsedMs < cursor + durations[index]) return index;
    cursor += durations[index];
  }
  return durations.length - 1;
}

/** Two different English voices when possible. One voice uses a lower pitch for the second speaker. */
export function speakerVoices(voices: { name: string; lang: string }[]): [SpeakerVoice, SpeakerVoice] {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  const pool = english.length ? english : voices;
  const first = pool[0];
  const second = pool.find((voice) => voice.name !== first?.name);
  if (first && second) {
    return [
      { name: first.name, lang: first.lang || 'en-US', pitch: 1, rateScale: 1 },
      { name: second.name, lang: second.lang || 'en-US', pitch: 1, rateScale: 1 },
    ];
  }
  return [
    { name: first?.name ?? '', lang: first?.lang || 'en-US', pitch: 1, rateScale: 1 },
    { name: first?.name ?? '', lang: first?.lang || 'en-US', pitch: 0.75, rateScale: 0.92 },
  ];
}
