import { useEffect, useSyncExternalStore } from 'react';
import {
  cachedPronunciationUrl,
  pronunciationLang,
  pronunciationUrl,
  pronunciationVoice,
  type PronunciationAccent,
} from '../pronounce';
import { termKey } from '../vocabulary';
import { useRetroTheme } from '../retroTheme';
import { PixelIcon } from './PixelIcon';

type Phase = 'idle' | 'loading' | 'playing';
type Live = { key: string; phase: Exclude<Phase, 'idle'> } | null;

let live: Live = null;
let token = 0;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function publish(next: Live) {
  live = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readLive(): Live {
  return live;
}

export function stopPronunciation() {
  token += 1;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* this browser has no speech */
  }
  publish(null);
}

function speak(term: string, accent: PronunciationAccent, mine: number) {
  let started = false;
  const start = () => {
    if (started || token !== mine) return;
    started = true;
    const utterance = new SpeechSynthesisUtterance(term);
    utterance.lang = pronunciationLang(accent);
    utterance.rate = 0.9;
    const live = window.speechSynthesis.getVoices();
    const choice = pronunciationVoice(live.map((voice) => ({
      lang: voice.lang,
      name: voice.name,
      voiceURI: voice.voiceURI,
      default: voice.default,
    })), accent);
    const match = choice && live.find((voice) => (
      (choice.voiceURI && voice.voiceURI === choice.voiceURI) || (choice.name && voice.name === choice.name && voice.lang === choice.lang)
    ));
    if (match) utterance.voice = match;
    utterance.onend = () => {
      if (token === mine) publish(null);
    };
    utterance.onerror = () => {
      if (token === mine) publish(null);
    };
    publish({ key: termKey(term), phase: 'playing' });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length) {
    start();
    return;
  }
  const onVoices = () => {
    window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
    start();
  };
  window.speechSynthesis.addEventListener('voiceschanged', onVoices);
  window.setTimeout(start, 300);
}

async function playUrl(url: string, term: string, accent: PronunciationAccent, mine: number) {
  const player = new Audio(url);
  audio = player;
  let failed = false;
  const fail = () => {
    if (failed || token !== mine) return;
    failed = true;
    audio = null;
    speak(term, accent, mine);
  };
  player.onended = () => {
    if (token === mine) publish(null);
  };
  player.onerror = fail;
  publish({ key: termKey(term), phase: 'playing' });
  try {
    await player.play();
  } catch {
    fail();
  }
}

export async function playPronunciation(term: string, accent: PronunciationAccent) {
  const spoken = term.replace(/\s+/g, ' ').trim();
  if (!spoken) return;
  stopPronunciation();
  const mine = token;
  const key = termKey(spoken);
  publish({ key, phase: 'loading' });
  const known = cachedPronunciationUrl(spoken);
  const url = known !== undefined ? known : await pronunciationUrl(spoken);
  if (token !== mine) return;
  if (!url) {
    speak(spoken, accent, mine);
    return;
  }
  try {
    await playUrl(url, spoken, accent, mine);
  } catch {
    if (token === mine) speak(spoken, accent, mine);
  }
}

export function PronounceButton({
  term,
  accent = 'british',
}: {
  term: string;
  accent?: PronunciationAccent;
}) {
  const current = useSyncExternalStore(subscribe, readLive, () => null);
  const phase: Phase = current?.key === termKey(term) ? current.phase : 'idle';
  const retro = useRetroTheme();

  useEffect(() => {
    void pronunciationUrl(term);
  }, [term]);

  return (
    <button
      type="button"
      aria-label="Play pronunciation"
      aria-pressed={phase === 'playing'}
      aria-busy={phase === 'loading'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void playPronunciation(term, accent);
      }}
      className={phase === 'playing'
        ? 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-700 text-white'
        : `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50 ${phase === 'loading' ? 'opacity-60' : ''}`}
    >
      {retro ? <PixelIcon name="speaker" size={20} /> : (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10v4h3l5 4V6L7 10H4z" />
        {phase === 'playing' ? (
          <path strokeLinecap="round" d="M16 9a4 4 0 010 6M18.5 7a7 7 0 010 10" />
        ) : (
          <path strokeLinecap="round" d="M16 9a4 4 0 010 6" />
        )}
      </svg>
      )}
    </button>
  );
}
